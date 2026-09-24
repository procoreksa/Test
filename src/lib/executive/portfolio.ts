import { prisma } from "@/lib/prisma";
import { computeOccupancySummary } from "@/lib/owner-portfolio-rules";
import type { ResolvedExecutiveFilters } from "@/lib/executive/filters";

/**
 * Portfolio KPIs (Steps 8-11) - Unit.status is the ONLY source of
 * occupancy, exactly as Critical Principle 2 requires (never inferred from
 * Invoice/Contract/Corporate-Housing data). Reuses
 * computeOccupancySummary() (src/lib/owner-portfolio-rules.ts) - the same
 * pure formula the Owner Portal and legacy /dashboard already share -
 * rather than recomputing occupancy a third way here.
 *
 * Snapshot metric (Critical Principle 4): the PERIOD filter is never
 * applied to unit counts. Compound/Building are location filters, not time
 * filters, so they DO narrow this snapshot.
 */
export interface CompoundBreakdown {
  compoundId: string;
  name: string;
  arabicName: string | null;
  total: number;
  occupied: number;
  vacant: number;
  occupancyRate: number;
}

export interface BuildingBreakdown {
  buildingId: string;
  compoundId: string;
  name: string;
  nameAr: string | null;
  total: number;
  occupied: number;
  vacant: number;
  occupancyRate: number;
}

export interface PortfolioSummary {
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  occupancyRate: number;
  totalCompounds: number;
  totalBuildings: number;
  totalFloors: number;
  byCompound: CompoundBreakdown[];
  byBuilding: BuildingBreakdown[];
}

export async function getPortfolioSummary(organizationId: string, filters: Pick<ResolvedExecutiveFilters, "compoundId" | "buildingId">): Promise<PortfolioSummary> {
  const floorWhere = filters.buildingId
    ? { buildingId: filters.buildingId }
    : filters.compoundId
      ? { building: { compoundId: filters.compoundId } }
      : {};

  const [units, totalCompounds, totalBuildings, totalFloors] = await Promise.all([
    prisma.unit.findMany({
      where: { organizationId, floor: floorWhere },
      select: {
        status: true,
        floor: { select: { building: { select: { id: true, name: true, nameAr: true, compound: { select: { id: true, name: true, arabicName: true } } } } } },
      },
    }),
    prisma.compound.count({ where: { organizationId, ...(filters.compoundId ? { id: filters.compoundId } : {}) } }),
    prisma.building.count({ where: { organizationId, ...(filters.buildingId ? { id: filters.buildingId } : filters.compoundId ? { compoundId: filters.compoundId } : {}) } }),
    prisma.floor.count({ where: { organizationId, ...floorWhere } }),
  ]);

  const overall = computeOccupancySummary(units.map((u) => u.status));

  const byCompoundMap = new Map<string, { name: string; arabicName: string | null; statuses: typeof units[number]["status"][] }>();
  const byBuildingMap = new Map<string, { compoundId: string; name: string; nameAr: string | null; statuses: typeof units[number]["status"][] }>();
  for (const u of units) {
    const building = u.floor.building;
    const compound = building.compound;
    const cEntry = byCompoundMap.get(compound.id) ?? { name: compound.name, arabicName: compound.arabicName, statuses: [] };
    cEntry.statuses.push(u.status);
    byCompoundMap.set(compound.id, cEntry);

    const bEntry = byBuildingMap.get(building.id) ?? { compoundId: compound.id, name: building.name, nameAr: building.nameAr, statuses: [] };
    bEntry.statuses.push(u.status);
    byBuildingMap.set(building.id, bEntry);
  }

  const byCompound: CompoundBreakdown[] = Array.from(byCompoundMap.entries()).map(([compoundId, v]) => {
    const s = computeOccupancySummary(v.statuses);
    return { compoundId, name: v.name, arabicName: v.arabicName, total: s.total, occupied: s.occupied, vacant: s.vacant, occupancyRate: s.occupancyRate };
  });
  const byBuilding: BuildingBreakdown[] = Array.from(byBuildingMap.entries()).map(([buildingId, v]) => {
    const s = computeOccupancySummary(v.statuses);
    return { buildingId, compoundId: v.compoundId, name: v.name, nameAr: v.nameAr, total: s.total, occupied: s.occupied, vacant: s.vacant, occupancyRate: s.occupancyRate };
  });

  return {
    totalUnits: overall.total,
    occupiedUnits: overall.occupied,
    vacantUnits: overall.vacant,
    occupancyRate: overall.occupancyRate,
    totalCompounds,
    totalBuildings,
    totalFloors,
    byCompound,
    byBuilding,
  };
}
