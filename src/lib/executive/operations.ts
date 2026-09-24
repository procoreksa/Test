import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sumDecimal } from "@/lib/executive/format";
import { computeRefundRemaining } from "@/lib/security-deposit-rules";
import type { ResolvedExecutiveFilters } from "@/lib/executive/filters";

/**
 * Operations KPIs (Steps 22-25) - Move-In/Move-Out counts reuse the exact
 * same status/date definitions as getOperationsDashboard() (src/lib/actions/
 * move-ins.ts:901) and getMoveOutDashboardKpis() (src/lib/actions/
 * move-outs.ts:1060), and Security Deposit reuses getSecurityDepositDashboardKpis()'s
 * own computeRefundRemaining()-based math (src/lib/actions/
 * security-deposits.ts:979) - re-queried here (rather than calling those
 * functions directly) only so a Compound/Building filter and the
 * executiveOperations.view permission gate can apply, never a competing
 * definition of "upcoming" or "overdue".
 */
export interface OperationsSummary {
  moveInsToday: number;
  moveInsUpcomingWeek: number;
  moveOutsToday: number;
  moveOutsUpcomingWeek: number;
  overdueMoveIns: number;
  overdueMoveOuts: number;
  pendingSettlements: number;
  refundsDueCount: number;
  refundAmountOutstanding: Prisma.Decimal;
}

function unitScope(filters: Pick<ResolvedExecutiveFilters, "compoundId" | "buildingId">) {
  if (filters.buildingId) return { unit: { floor: { buildingId: filters.buildingId } } };
  if (filters.compoundId) return { unit: { floor: { building: { compoundId: filters.compoundId } } } };
  return {};
}

export async function getOperationsSummary(organizationId: string, filters: Pick<ResolvedExecutiveFilters, "compoundId" | "buildingId">, now: Date): Promise<OperationsSummary> {
  const scope = unitScope(filters);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const [moveInsToday, moveInsUpcomingWeek, overdueMoveIns, moveOutsToday, moveOutsUpcomingWeek, overdueMoveOuts, pendingSettlements, settlementsForRefund] = await Promise.all([
    prisma.moveIn.count({ where: { organizationId, scheduledAt: { gte: startOfToday, lt: endOfToday }, ...scope } }),
    prisma.moveIn.count({ where: { organizationId, scheduledAt: { gte: endOfToday, lt: endOfWeek }, ...scope } }),
    prisma.moveIn.count({ where: { organizationId, scheduledAt: { lt: now }, status: { notIn: ["COMPLETED", "CANCELLED"] }, ...scope } }),
    prisma.moveOut.count({ where: { organizationId, scheduledAt: { gte: startOfToday, lt: endOfToday }, ...scope } }),
    prisma.moveOut.count({ where: { organizationId, scheduledAt: { gte: endOfToday, lt: endOfWeek }, ...scope } }),
    prisma.moveOut.count({ where: { organizationId, scheduledAt: { lt: now }, status: { notIn: ["COMPLETED", "CANCELLED"] }, ...scope } }),
    prisma.securityDepositSettlement.count({ where: { organizationId, status: { in: ["UNDER_REVIEW", "PENDING_APPROVAL", "APPROVED"] }, ...scope } }),
    prisma.securityDepositSettlement.findMany({
      where: { organizationId, status: { in: ["POSTED", "PARTIALLY_SETTLED"] }, ...scope },
      select: { approvedRefundDue: true, refunds: { where: { status: "PAID" }, select: { amount: true } } },
    }),
  ]);

  let refundsDueCount = 0;
  let refundAmountOutstanding = new Prisma.Decimal(0);
  for (const s of settlementsForRefund) {
    const due = s.approvedRefundDue ?? new Prisma.Decimal(0);
    const paid = sumDecimal(s.refunds.map((r) => r.amount));
    const remaining = computeRefundRemaining(due, paid);
    if (remaining.greaterThan(0)) {
      refundsDueCount += 1;
      refundAmountOutstanding = refundAmountOutstanding.plus(remaining);
    }
  }

  return {
    moveInsToday,
    moveInsUpcomingWeek,
    moveOutsToday,
    moveOutsUpcomingWeek,
    overdueMoveIns,
    overdueMoveOuts,
    pendingSettlements,
    refundsDueCount,
    refundAmountOutstanding,
  };
}
