"use server";

import { prisma } from "@/lib/prisma";
import { requireOwnerPrincipal } from "@/lib/owner-session";
import { resolveOwnerEffectiveUnits, resolveOwnerEffectiveScope } from "@/lib/owner-portfolio-query";
import { computeOccupancySummary } from "@/lib/owner-portfolio-rules";
import { summarizeOwnerLedgerEntries } from "@/lib/owner-ledger-rules";

/** Maintenance statuses considered "open" - the exact same set src/lib/actions/portal/dashboard.ts already uses for the Tenant Portal's own "Open Maintenance Requests" KPI, never invented independently here. */
const OPEN_MAINTENANCE_STATUSES = ["OPEN", "TRIAGED", "WORK_ORDER_CREATED"] as const;

/**
 * Owner Portal dashboard KPIs (Step 18-20). Every occupancy figure comes
 * from the one centralized computeOccupancySummary() helper
 * (src/lib/owner-portfolio-rules.ts); every financial figure comes
 * exclusively from OwnerLedgerEntry via summarizeOwnerLedgerEntries()
 * (src/lib/owner-ledger-rules.ts) - never a sum over Invoice/Payment/
 * Contract/MaintenanceRequest cost fields, which would be a second,
 * un-reconciled accounting engine.
 */
export async function getOwnerPortalDashboard() {
  const { organizationId, ownerId } = await requireOwnerPrincipal();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [units, scope, allLedgerEntries, monthLedgerEntries] = await Promise.all([
    resolveOwnerEffectiveUnits(organizationId, ownerId),
    resolveOwnerEffectiveScope(organizationId, ownerId),
    prisma.ownerLedgerEntry.findMany({ where: { organizationId, ownerId }, select: { entryType: true, debit: true, credit: true } }),
    prisma.ownerLedgerEntry.findMany({ where: { organizationId, ownerId, entryDate: { gte: monthStart } }, select: { entryType: true, debit: true, credit: true } }),
  ]);

  const occupancy = computeOccupancySummary(units.map((u) => u.status));
  const unitIds = Array.from(new Set(units.map((u) => u.unitId)));

  const [activeContracts, openMaintenanceCount] = await Promise.all([
    unitIds.length > 0 ? prisma.contract.count({ where: { organizationId, unitId: { in: unitIds }, status: "ACTIVE" } }) : Promise.resolve(0),
    prisma.maintenanceRequest.count({
      where: {
        organizationId,
        status: { in: [...OPEN_MAINTENANCE_STATUSES] },
        OR: [{ unitId: { in: unitIds } }, { buildingId: { in: Array.from(scope.buildingIds) } }, { compoundId: { in: Array.from(scope.compoundIds) } }],
      },
    }),
  ]);

  const allTime = summarizeOwnerLedgerEntries(allLedgerEntries);
  const thisMonth = summarizeOwnerLedgerEntries(monthLedgerEntries);

  return {
    propertyCount: new Set(units.map((u) => u.compoundId)).size,
    unitCount: occupancy.total,
    occupied: occupancy.occupied,
    vacant: occupancy.vacant,
    occupancyRate: occupancy.occupancyRate,
    activeContracts,
    monthlyIncome: thisMonth.totalIncome,
    monthlyExpenses: thisMonth.totalExpenses,
    // "Net Owner Position": this month's ledger-based net movement (income
    // minus expenses) - a point-in-time performance figure, deliberately
    // distinct from "Outstanding Owner Balance" below (the all-time
    // cumulative balance actually owed).
    netPosition: thisMonth.totalIncome.minus(thisMonth.totalExpenses),
    outstandingBalance: allTime.balance,
    openMaintenanceCount,
  };
}
