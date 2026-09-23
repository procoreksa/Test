"use server";

import type { CorporateHousingAllocationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { isPlannedArrival, isPlannedDeparture, isUnitUnallocated, computeAllocationRate } from "@/lib/corporate-housing-rules";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Corporate Housing dashboard KPIs (Step 36), every one defined centrally
 * here - never recomputed ad hoc per page. "Corporate-leased" always means
 * "at least one ACTIVE Contract under a CorporateAccount's own Renter"
 * (any CorporateAccount, regardless of its own status - the account status
 * governs the commercial relationship, not whether an existing lease is
 * still legally in force), never inferred from Unit.status alone.
 */
export async function getCorporateHousingDashboard() {
  const { organizationId } = await requirePermission("corporateHousing.view");

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * DAY_MS);
  const in30Days = new Date(now.getTime() + 30 * DAY_MS);
  const in60Days = new Date(now.getTime() + 60 * DAY_MS);
  const in90Days = new Date(now.getTime() + 90 * DAY_MS);

  const [activeAccountsCount, corporateAccounts, activeOccupantsCount, allocations] = await Promise.all([
    prisma.corporateAccount.count({ where: { organizationId, status: "ACTIVE" } }),
    prisma.corporateAccount.findMany({ where: { organizationId }, select: { renterId: true } }),
    prisma.corporateOccupant.count({ where: { organizationId, status: "ACTIVE" } }),
    prisma.corporateHousingAllocation.findMany({ where: { organizationId }, select: { status: true, startDate: true, plannedEndDate: true, unitId: true } }),
  ]);

  const corporateRenterIds = corporateAccounts.map((a) => a.renterId);
  const corporateContracts = corporateRenterIds.length
    ? await prisma.contract.findMany({ where: { organizationId, renterId: { in: corporateRenterIds }, status: "ACTIVE" }, select: { unitId: true, endDate: true } })
    : [];
  const corporateLeasedUnitIds = Array.from(new Set(corporateContracts.map((c) => c.unitId)));

  const openMaintenanceCount = corporateLeasedUnitIds.length
    ? await prisma.maintenanceRequest.count({ where: { organizationId, unitId: { in: corporateLeasedUnitIds }, status: { in: ["OPEN", "TRIAGED", "WORK_ORDER_CREATED"] } } })
    : 0;

  const allocationStatusesByUnit = new Map<string, CorporateHousingAllocationStatus[]>();
  for (const allocation of allocations) {
    const list = allocationStatusesByUnit.get(allocation.unitId) ?? [];
    list.push(allocation.status);
    allocationStatusesByUnit.set(allocation.unitId, list);
  }
  const unitsWithActiveAllocationCount = corporateLeasedUnitIds.filter((unitId) => !isUnitUnallocated(allocationStatusesByUnit.get(unitId) ?? [])).length;
  const unallocatedCorporateUnits = corporateLeasedUnitIds.length - unitsWithActiveAllocationCount;

  return {
    activeAccountsCount,
    corporateContractCount: corporateContracts.length,
    corporateLeasedUnitCount: corporateLeasedUnitIds.length,
    activeOccupantsCount,
    activeAllocationsCount: allocations.filter((a) => a.status === "ACTIVE").length,
    plannedArrivals7d: allocations.filter((a) => isPlannedArrival(a, now, in7Days)).length,
    plannedArrivals30d: allocations.filter((a) => isPlannedArrival(a, now, in30Days)).length,
    plannedDepartures7d: allocations.filter((a) => isPlannedDeparture(a, now, in7Days)).length,
    plannedDepartures30d: allocations.filter((a) => isPlannedDeparture(a, now, in30Days)).length,
    unallocatedCorporateUnits,
    allocationRate: computeAllocationRate({ corporateLeasedUnitCount: corporateLeasedUnitIds.length, unitsWithActiveAllocationCount }),
    openMaintenanceCount,
    contractsExpiringSoon30: corporateContracts.filter((c) => c.endDate >= now && c.endDate <= in30Days).length,
    contractsExpiringSoon60: corporateContracts.filter((c) => c.endDate >= now && c.endDate <= in60Days).length,
    contractsExpiringSoon90: corporateContracts.filter((c) => c.endDate >= now && c.endDate <= in90Days).length,
  };
}
