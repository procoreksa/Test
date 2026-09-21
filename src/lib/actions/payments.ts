"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { nextCounterValue, formatReceiptNumber } from "@/lib/numbering";
import { getLocale, getDictionary, currencyFormatter } from "@/lib/i18n";
import { recomputeScheduleStatus } from "@/lib/schedule-status";

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

    await tx.payment.create({
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
  });

  revalidatePath("/invoices");
  revalidatePath("/collections");
  revalidatePath("/payments");
}

export async function listPayments() {
  const { organizationId } = await requirePermission("payment.view");
  return prisma.payment.findMany({
    where: { organizationId },
    include: { renter: true, invoice: true },
    orderBy: { createdAt: "desc" },
  });
}
