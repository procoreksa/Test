import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, differenceInCalendarDays } from "date-fns";
import { sumDecimal, safeRate } from "@/lib/executive/format";
import { aggregateReceivableAging, type AgingSummary } from "@/lib/executive/kpi-rules";
import type { ResolvedExecutiveFilters } from "@/lib/executive/filters";

/**
 * Collections KPIs (Steps 15-21). Authoritative sources, never recomputed:
 *  - Invoiced/Collected are period totals over Invoice.totalAmount /
 *    Payment.amount respectively - the same fields getInvoiceTotals()
 *    (src/lib/actions/dashboard.ts) already sums, but unlike that legacy
 *    query, CANCELLED invoices are explicitly excluded here (Step 1 audit
 *    finding: the legacy dashboard's own known gap, docs/TECHNICAL-DEBT.md
 *    item 5 - a deliberate, documented deviation, not a silent
 *    inconsistency).
 *  - Collected sums Payment.amount with NO status filter at all: a reversed
 *    payment's original row keeps its original positive amount (status
 *    flips to REVERSED) and reversePayment() posts a second, negative-amount
 *    row - summing both nets to zero automatically (src/lib/actions/
 *    payments.ts:133-201). Filtering by `status: "POSTED"` would WRONGLY
 *    exclude the original row and double-count the reversal - see the
 *    "payment reversal nets collected to zero" real-DB test.
 *  - Outstanding Receivables is a SNAPSHOT (never period-filtered - Critical
 *    Principle 4): `SUM(totalAmount - paidAmount)` over every non-CANCELLED
 *    invoice, regardless of issueDate.
 *  - Overdue Receivables reuses getOverdueReport()'s own exact definition
 *    (src/lib/actions/reports.ts:196-211): `PaymentSchedule.status ===
 *    "OVERDUE"`. These two receivable figures are never summed together -
 *    they measure different populations (billed-unpaid vs. schedule rows
 *    that may not even be invoiced yet) - see docs/EXECUTIVE-DASHBOARDS.md
 *    "Outstanding vs. Overdue" and the anti-double-count reconciliation
 *    test.
 */
export interface CollectionsSummary {
  invoicedThisPeriod: Prisma.Decimal;
  collectedThisPeriod: Prisma.Decimal;
  /** Collected / Invoiced for the SAME period - a cohort-timing caveat applies (a payment this period may pay off an invoice issued in a prior period), surfaced in the UI tooltip rather than hidden. */
  collectionRate: number;
  outstandingReceivables: Prisma.Decimal;
  overdueReceivablesCount: number;
  overdueReceivablesAmount: Prisma.Decimal;
  dueNext7Days: Prisma.Decimal;
  dueNext30Days: Prisma.Decimal;
  aging: AgingSummary;
}

function contractScope(filters: Pick<ResolvedExecutiveFilters, "compoundId" | "buildingId">) {
  if (filters.buildingId) return { contract: { unit: { floor: { buildingId: filters.buildingId } } } };
  if (filters.compoundId) return { contract: { unit: { floor: { building: { compoundId: filters.compoundId } } } } };
  return {};
}

export async function getCollectionsSummary(
  organizationId: string,
  period: { gte: Date; lt: Date },
  filters: Pick<ResolvedExecutiveFilters, "compoundId" | "buildingId">,
  now: Date
): Promise<CollectionsSummary> {
  const scope = contractScope(filters);

  const [invoicedAgg, collectedAgg, outstandingInvoices, overdueSchedules, dueSchedules] = await Promise.all([
    prisma.invoice.aggregate({ where: { organizationId, issueDate: period, status: { not: "CANCELLED" }, ...scope }, _sum: { totalAmount: true } }),
    prisma.payment.aggregate({ where: { organizationId, paymentDate: period, invoice: scope }, _sum: { amount: true } }),
    prisma.invoice.findMany({ where: { organizationId, status: { not: "CANCELLED" }, ...scope }, select: { dueDate: true, totalAmount: true, paidAmount: true } }),
    prisma.paymentSchedule.findMany({ where: { organizationId, status: "OVERDUE", ...scope }, select: { amount: true } }),
    prisma.paymentSchedule.findMany({ where: { organizationId, status: { in: ["PENDING", "PARTIALLY_INVOICED"] }, dueDate: { gte: now, lte: addDays(now, 30) }, ...scope }, select: { amount: true, dueDate: true } }),
  ]);

  const outstandingRows = outstandingInvoices
    .map((inv) => ({ dueDate: inv.dueDate, outstanding: new Prisma.Decimal(inv.totalAmount).minus(inv.paidAmount) }))
    .filter((r) => r.outstanding.greaterThan(0));
  const aging = aggregateReceivableAging(outstandingRows, now);

  const dueNext7Days = sumDecimal(dueSchedules.filter((s) => differenceInCalendarDays(s.dueDate, now) <= 7).map((s) => s.amount));
  const dueNext30Days = sumDecimal(dueSchedules.map((s) => s.amount));

  const invoicedThisPeriod = invoicedAgg._sum.totalAmount ?? new Prisma.Decimal(0);
  const collectedThisPeriod = collectedAgg._sum.amount ?? new Prisma.Decimal(0);

  return {
    invoicedThisPeriod,
    collectedThisPeriod,
    collectionRate: safeRate(Number(collectedThisPeriod), Number(invoicedThisPeriod)),
    outstandingReceivables: aging.total,
    overdueReceivablesCount: overdueSchedules.length,
    overdueReceivablesAmount: sumDecimal(overdueSchedules.map((s) => s.amount)),
    dueNext7Days,
    dueNext30Days,
    aging,
  };
}
