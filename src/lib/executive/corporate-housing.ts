import type { CorporateHousingAllocationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isUnitUnallocated, computeAllocationRate } from "@/lib/corporate-housing-rules";

/**
 * Corporate Housing KPIs (Steps 46-48) - reuses isUnitUnallocated()/
 * computeAllocationRate() (src/lib/corporate-housing-rules.ts:189/205), the
 * exact same pure functions getCorporateHousingDashboard() (src/lib/actions/
 * corporate-housing-dashboard.ts) already uses - never a second allocation-
 * rate formula. "Corporate-leased but unallocated" is deliberately NOT
 * equated with `Unit.status === VACANT` (Critical Principle 2/3): a
 * corporate-leased Unit can be contractually OCCUPIED (an ACTIVE Contract
 * exists) with zero currently-ACTIVE occupants - `unallocatedCorporateUnits`
 * surfaces exactly that population, distinct from Portfolio's own Vacant
 * Units count.
 */
export interface CorporateHousingSummary {
  corporateLeasedUnits: number;
  activeCorporateOccupants: number;
  activeAllocations: number;
  unallocatedCorporateUnits: number;
  allocationRate: number;
}

export async function getCorporateHousingSummary(organizationId: string): Promise<CorporateHousingSummary> {
  const [corporateAccounts, activeOccupantsCount, allocations] = await Promise.all([
    prisma.corporateAccount.findMany({ where: { organizationId }, select: { renterId: true } }),
    prisma.corporateOccupant.count({ where: { organizationId, status: "ACTIVE" } }),
    prisma.corporateHousingAllocation.findMany({ where: { organizationId }, select: { status: true, unitId: true } }),
  ]);

  const corporateRenterIds = corporateAccounts.map((a) => a.renterId);
  const corporateContracts = corporateRenterIds.length
    ? await prisma.contract.findMany({ where: { organizationId, renterId: { in: corporateRenterIds }, status: "ACTIVE" }, select: { unitId: true } })
    : [];
  const corporateLeasedUnitIds = Array.from(new Set(corporateContracts.map((c) => c.unitId)));

  const allocationStatusesByUnit = new Map<string, CorporateHousingAllocationStatus[]>();
  for (const a of allocations) {
    const list = allocationStatusesByUnit.get(a.unitId) ?? [];
    list.push(a.status);
    allocationStatusesByUnit.set(a.unitId, list);
  }
  const unitsWithActiveAllocationCount = corporateLeasedUnitIds.filter((unitId) => !isUnitUnallocated(allocationStatusesByUnit.get(unitId) ?? [])).length;

  return {
    corporateLeasedUnits: corporateLeasedUnitIds.length,
    activeCorporateOccupants: activeOccupantsCount,
    activeAllocations: allocations.filter((a) => a.status === "ACTIVE").length,
    unallocatedCorporateUnits: corporateLeasedUnitIds.length - unitsWithActiveAllocationCount,
    allocationRate: computeAllocationRate({ corporateLeasedUnitCount: corporateLeasedUnitIds.length, unitsWithActiveAllocationCount }),
  };
}
