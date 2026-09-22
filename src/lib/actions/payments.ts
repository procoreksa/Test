"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/session";
import { nextCounterValue, formatReceiptNumber } from "@/lib/numbering";
import { getLocale, getDictionary, currencyFormatter } from "@/lib/i18n";
import { recomputeScheduleStatus } from "@/lib/schedule-status";
import { auditCreate, auditAction, requirePermissionAudited } from "@/lib/audit";

function paymentSchema(t: ReturnType<typeof getDictionary>) {
  return z.object({
    invoiceId: z.string().min(1),
    amount: z.coerce.number().positive(t.validation.installmentAmountPositive),
    method: z.enum(["CASH", "BANK_TRANSFER", "CHEQUE", "CARD", "ONLINE"]),
    paymentDate: z.coerce.date().optional(),
    referenceNumber: z.string().optional(),
    notes: z.string().optional(),
  });
}

export async function recordPayment(formData: FormData) {
  const { organizationId } = await requirePermission("payment.create");
  const locale = await getLocale();
  const t = getDictionary(locale);
  const parsed = paymentSchema(t).parse({
    invoiceId: formData.get("invoiceId"),
    amount: formData.get("amount"),
    method: formData.get("method"),
    paymentDate: formData.get("paymentDate") || undefined,
    referenceNumber: formData.get("referenceNumber") || undefined,
    notes: formData.get("notes") || undefined,
  });

  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: parsed.invoiceId, organizationId },
      include: { lines: { select: { paymentScheduleId: true } } },
    });

    const remaining = Number(invoice.totalAmount) - Number(invoice.paidAmount);
    if (parsed.amount > remaining + 0.01) {
      throw new Error(t.validation.paymentExceedsRemaining(currencyFormatter(locale).format(remaining)));
    }

    const seq = await nextCounterValue(tx, organizationId, "receipt");
    const receiptNumber = formatReceiptNumber(seq, new Date().getFullYear());

    const payment = await tx.payment.create({
      data: {
        organizationId,
        invoiceId: invoice.id,
        renterId: invoice.renterId,
        receiptNumber,
        amount: parsed.amount,
        paymentDate: parsed.paymentDate ?? new Date(),
        method: parsed.method,
        referenceNumber: parsed.referenceNumber,
        notes: parsed.notes,
      },
    });

    const newPaidAmount = Number(invoice.paidAmount) + parsed.amount;
    const newStatus = newPaidAmount >= Number(invoice.totalAmount) - 0.01 ? "PAID" : "PARTIALLY_PAID";

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { paidAmount: newPaidAmount, status: newStatus },
    });

    const scheduleIds = Array.from(
      new Set(invoice.lines.map((l) => l.paymentScheduleId).filter((id): id is string => !!id))
    );
    for (const scheduleId of scheduleIds) {
      await recomputeScheduleStatus(tx, scheduleId);
    }

    await auditCreate(tx, {
      action: "PAYMENT_RECORDED",
      entityType: "Payment",
      entityId: payment.id,
      entityDisplayName: payment.receiptNumber,
      newValues: {
        invoiceId: payment.invoiceId,
        amount: payment.amount,
        method: payment.method,
        paymentDate: payment.paymentDate,
        referenceNumber: payment.referenceNumber,
      },
    });
  });

  revalidatePath("/invoices");
  revalidatePath("/collections");
  revalidatePath("/payments");
}

/**
 * Corrects a posted payment without hard-deleting or editing it: posts a
 * new, NEGATIVE-amount Payment row (reversalOfPaymentId links back to the
 * original) and flips the original to REVERSED. The negative amount means
 * every existing SUM(amount)-based report/statement (collections report,
 * renter/unit ledgers, the payments list) already nets out correctly with
 * no query changes required - see docs/AUDIT-AND-FINANCIAL-CONTROLS.md,
 * "Payment reversal decision".
 */
export async function reversePayment(paymentId: string) {
  const { organizationId } = await requirePermissionAudited("payment.create", "Payment", paymentId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  return prisma.$transaction(async (tx) => {
    const original = await tx.payment.findUniqueOrThrow({ where: { id: paymentId, organizationId } });
    if (original.status === "REVERSED") {
      throw new Error(t.validation.paymentAlreadyReversed);
    }
    const alreadyReversed = await tx.payment.findUnique({ where: { reversalOfPaymentId: paymentId } });
    if (alreadyReversed) {
      throw new Error(t.validation.paymentAlreadyReversed);
    }

    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: original.invoiceId },
      include: { lines: { select: { paymentScheduleId: true } } },
    });

    const seq = await nextCounterValue(tx, organizationId, "receipt");
    const receiptNumber = formatReceiptNumber(seq, new Date().getFullYear());

    const reversal = await tx.payment.create({
      data: {
        organizationId,
        invoiceId: original.invoiceId,
        renterId: original.renterId,
        receiptNumber,
        amount: original.amount.negated(),
        paymentDate: new Date(),
        method: original.method,
        referenceNumber: original.referenceNumber,
        notes: `Reversal of receipt ${original.receiptNumber}`,
        reversalOfPaymentId: original.id,
      },
    });

    await tx.payment.update({ where: { id: original.id }, data: { status: "REVERSED" } });

    const newPaidAmount = Math.max(0, Number(invoice.paidAmount) - Number(original.amount));
    const now = new Date();
    const newStatus =
      newPaidAmount <= 0.01
        ? invoice.dueDate && invoice.dueDate < now
          ? "OVERDUE"
          : "ISSUED"
        : newPaidAmount >= Number(invoice.totalAmount) - 0.01
          ? "PAID"
          : "PARTIALLY_PAID";

    await tx.invoice.update({ where: { id: invoice.id }, data: { paidAmount: newPaidAmount, status: newStatus } });

    const scheduleIds = Array.from(
      new Set(invoice.lines.map((l) => l.paymentScheduleId).filter((id): id is string => !!id))
    );
    for (const scheduleId of scheduleIds) {
      await recomputeScheduleStatus(tx, scheduleId);
    }

    await auditAction(tx, {
      action: "PAYMENT_REVERSED",
      entityType: "Payment",
      entityId: original.id,
      entityDisplayName: original.receiptNumber,
      previousValues: { status: "POSTED" },
      newValues: { status: "REVERSED", reversalPaymentId: reversal.id, reversalReceiptNumber: reversal.receiptNumber },
      metadata: { performedBy: user.id },
    });

    return reversal.id;
  }).then((reversalId) => {
    revalidatePath("/invoices");
    revalidatePath("/collections");
    revalidatePath("/payments");
    return reversalId;
  });
}

export async function listPayments() {
  const { organizationId } = await requirePermission("payment.view");
  return prisma.payment.findMany({
    where: { organizationId },
    include: { renter: true, invoice: true },
    orderBy: { createdAt: "desc" },
  });
}
