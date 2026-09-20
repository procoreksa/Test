import type { Prisma, PrismaClient, ScheduleStatus } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

const EPSILON = 0.01;

/**
 * A schedule installment can now be invoiced piecemeal (rent now, commission
 * later, ...) across several separate invoices, so its status can no longer
 * be flipped directly by whoever issues one invoice or records one payment -
 * it has to be recomputed from everything billed against it so far. Called
 * after issuing an invoice, cancelling one, or recording a payment.
 */
export async function recomputeScheduleStatus(tx: Tx, scheduleId: string): Promise<ScheduleStatus> {
  const schedule = await tx.paymentSchedule.findUniqueOrThrow({ where: { id: scheduleId } });

  const totalBillable = round2(
    Number(schedule.rentAmount) +
      Number(schedule.commissionAmount) +
      Number(schedule.cleaningAmount) +
      Number(schedule.securityDepositAmount)
  );

  const lines = await tx.invoiceLine.findMany({
    where: { paymentScheduleId: scheduleId, invoice: { status: { not: "CANCELLED" } } },
    include: { invoice: { select: { id: true, totalAmount: true, paidAmount: true, status: true } } },
  });

  const invoicedTotal = round2(lines.reduce((sum, l) => sum + Number(l.unitPrice) * Number(l.quantity) - Number(l.discount), 0));

  const invoiceIds = new Set(lines.map((l) => l.invoice.id));
  let invoicedGrandTotal = 0;
  let paidTotal = 0;
  for (const inv of await tx.invoice.findMany({ where: { id: { in: Array.from(invoiceIds) } } })) {
    invoicedGrandTotal += Number(inv.totalAmount);
    paidTotal += Number(inv.paidAmount);
  }
  // Proportion of what's been paid, relative to the (possibly VAT-inclusive)
  // invoiced total, applied to the pre-VAT billable amount tracked here.
  const paidShare = invoicedGrandTotal > 0 ? Math.min(1, paidTotal / invoicedGrandTotal) : 0;
  const paidPortionOfBillable = round2(invoicedTotal * paidShare);

  let status: ScheduleStatus;
  if (invoicedTotal <= 0) {
    status = schedule.dueDate < new Date() ? "OVERDUE" : "PENDING";
  } else if (paidPortionOfBillable >= totalBillable - EPSILON) {
    status = "PAID";
  } else if (paidPortionOfBillable > EPSILON) {
    status = "PARTIALLY_PAID";
  } else if (invoicedTotal >= totalBillable - EPSILON) {
    status = "INVOICED";
  } else {
    status = "PARTIALLY_INVOICED";
  }

  await tx.paymentSchedule.update({ where: { id: scheduleId }, data: { status } });
  return status;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface ScheduleRemaining {
  rent: number;
  commission: number;
  cleaning: number;
  securityDeposit: number;
}

/** How much of each component of a schedule has NOT yet been invoiced (on a non-cancelled invoice). */
export async function getScheduleRemaining(tx: Tx, scheduleId: string): Promise<ScheduleRemaining> {
  const schedule = await tx.paymentSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
  const lines = await tx.invoiceLine.findMany({
    where: { paymentScheduleId: scheduleId, invoice: { status: { not: "CANCELLED" } } },
  });

  const invoicedByKind = { RENT: 0, COMMISSION: 0, CLEANING: 0, SECURITY_DEPOSIT: 0 } as Record<string, number>;
  for (const line of lines) {
    const net = Number(line.unitPrice) * Number(line.quantity) - Number(line.discount);
    invoicedByKind[line.kind] = (invoicedByKind[line.kind] ?? 0) + net;
  }

  return {
    rent: Math.max(0, round2(Number(schedule.rentAmount) - invoicedByKind.RENT)),
    commission: Math.max(0, round2(Number(schedule.commissionAmount) - invoicedByKind.COMMISSION)),
    cleaning: Math.max(0, round2(Number(schedule.cleaningAmount) - invoicedByKind.CLEANING)),
    securityDeposit: Math.max(0, round2(Number(schedule.securityDepositAmount) - invoicedByKind.SECURITY_DEPOSIT)),
  };
}
