import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeResponseSlaStatus, computeResolutionSlaStatus, computeOverallSlaStatus } from "@/lib/operations/maintenance-rules";
import type { ResolvedExecutiveFilters } from "@/lib/executive/filters";

/**
 * Maintenance KPIs (Steps 26-29) - open/SLA-breached counts and monthly cost
 * reuse the exact same status sets and SLA formulas as
 * getMaintenanceDashboardKpis() (src/lib/actions/maintenance.ts:1398), never
 * a competing definition. Maintenance-Cost-vs-Owner-Expense boundary
 * (Critical Principle 3/Step 27): `maintenanceCostThisPeriod` is
 * MaintenanceWorkOrder.actualCost - an OPERATIONAL cost - and is NEVER
 * labeled "Owner Expense" here; a real Owner Expense figure only exists if
 * an OwnerLedgerEntry of type MAINTENANCE_EXPENSE was separately posted
 * (see src/lib/executive/owner-financials.ts), which the Step 1 audit
 * confirmed has zero automatic code paths from Maintenance today.
 *
 * Field-level RBAC (Step 91's mandatory server-side test): `costVisible`
 * gates whether `maintenanceCostThisPeriod` is populated or `null` - decided
 * HERE, server-side, from the caller's own `maintenance.cost.view`
 * permission, never left to the UI to hide a value it already received.
 */
export interface MaintenanceSummary {
  openRequests: number;
  emergencyRequests: number;
  slaBreached: number;
  workOrdersInProgress: number;
  /** null when the caller lacks maintenance.cost.view - see the module doc comment. */
  maintenanceCostThisPeriod: Prisma.Decimal | null;
}

/**
 * MaintenanceRequest denormalizes compoundId/buildingId directly (populated
 * by resolveMaintenanceLocation() for every scopeType, not just UNIT), so a
 * location filter is a direct column match here - no Unit/Floor traversal
 * needed, and it correctly covers COMPOUND/BUILDING-scope requests too,
 * which have no `unit` at all.
 */
function requestScope(filters: Pick<ResolvedExecutiveFilters, "compoundId" | "buildingId">) {
  if (filters.buildingId) return { buildingId: filters.buildingId };
  if (filters.compoundId) return { compoundId: filters.compoundId };
  return {};
}

export async function getMaintenanceSummary(
  organizationId: string,
  period: { gte: Date; lt: Date },
  filters: Pick<ResolvedExecutiveFilters, "compoundId" | "buildingId">,
  costVisible: boolean
): Promise<MaintenanceSummary> {
  const scope = requestScope(filters);

  const [openRequests, emergencyRequests, inProgress, openWithSla, costAggregate] = await Promise.all([
    prisma.maintenanceRequest.count({ where: { organizationId, status: { notIn: ["RESOLVED", "CANCELLED"] }, ...scope } }),
    prisma.maintenanceRequest.count({ where: { organizationId, priority: "EMERGENCY", status: { notIn: ["RESOLVED", "CANCELLED"] }, ...scope } }),
    prisma.maintenanceWorkOrder.count({ where: { organizationId, status: "IN_PROGRESS", request: { ...scope } } }),
    prisma.maintenanceRequest.findMany({
      where: { organizationId, status: { notIn: ["RESOLVED", "CANCELLED"] }, ...scope },
      select: { reportedAt: true, responseDueAt: true, resolutionDueAt: true, firstResponseAt: true, resolvedAt: true, status: true },
    }),
    costVisible
      ? prisma.maintenanceWorkOrder.aggregate({ where: { organizationId, closedAt: period, request: { ...scope } }, _sum: { actualCost: true } })
      : Promise.resolve(null),
  ]);

  const slaBreached = openWithSla.filter((r) => {
    const response = computeResponseSlaStatus({ reportedAt: r.reportedAt, responseDueAt: r.responseDueAt, firstResponseAt: r.firstResponseAt });
    const resolution = computeResolutionSlaStatus({ reportedAt: r.reportedAt, resolutionDueAt: r.resolutionDueAt, resolvedAt: r.resolvedAt, requestStatus: r.status });
    return computeOverallSlaStatus(response, resolution) === "BREACHED";
  }).length;

  return {
    openRequests,
    emergencyRequests,
    slaBreached,
    workOrdersInProgress: inProgress,
    maintenanceCostThisPeriod: costVisible ? (costAggregate?._sum.actualCost ?? new Prisma.Decimal(0)) : null,
  };
}
