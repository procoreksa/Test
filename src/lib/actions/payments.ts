"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgId } from "@/lib/session";
import { nextCounterValue, formatReceiptNumber } from "@/lib/numbering";

const paymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.coerce.number().positive("قيمة الدفعة يجب أن تكون أكبر من صفر"),
  method: z.enum(["CASH", "BANK_TRANSFER", "CHEQUE", "CARD", "ONLINE"]),
  paymentDate: z.coerce.date().optional(),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
});

export async function recordPayment(formData: FormData) {
  const organizationId = await requireOrgId();
  const parsed = paymentSchema.parse({
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
    });

    const remaining = Number(invoice.totalAmount) - Number(invoice.paidAmount);
    if (parsed.amount > remaining + 0.01) {
      throw new Error(`قيمة الدفعة تتجاوز المبلغ المتبقي (${remaining.toFixed(2)})`);
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

    await tx.paymentSchedule.updateMany({
      where: { invoiceId: invoice.id },
      data: { status: newStatus === "PAID" ? "PAID" : "PARTIALLY_PAID" },
    });
  });

  revalidatePath("/invoices");
  revalidatePath("/collections");
  revalidatePath("/payments");
}

export async function listPayments() {
  const organizationId = await requireOrgId();
  return prisma.payment.findMany({
    where: { organizationId },
    include: { renter: true, invoice: true },
    orderBy: { createdAt: "desc" },
  });
}
