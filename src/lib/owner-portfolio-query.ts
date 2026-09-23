import { prisma } from "@/lib/prisma";
import { pickEffectiveOwnershipLevel, type AssetLevel, type OwnershipRow } from "@/lib/ownership";
import type { Prisma, UnitStatus } from "@prisma/client";

/**
 * Bulk ownership-resolution helpers shared by every Owner Portal data query
 * (dashboard/portfolio/units/contracts/maintenance scoping). These always
 * self-scope to the caller's OWN `ownerId` (from src/lib/owner-session.ts's
 * `requireOwnerPrincipal()`) - never accept one as an external parameter -
 * and always reuse `pickEffectiveOwnershipLevel()` (src/lib/ownership.ts),
 * the exact same inheritance/override primitive `getEffectiveOwners()` and
 * the internal `getOwnerPortfolio()` report already use. This is never a
 * second ownership engine: it is the identical Unit -> Building -> Compound
 * precedence, bulk-fetched once and resolved in memory (the same N+1-free
 * technique already used internally by getOwnerPortfolio() in
 * src/lib/actions/owner-reports.ts) so a portfolio page never issues one
 * ownership query per row. See docs/OWNER-PORTAL.md, "Ownership entitlement
 * architecture" / "Ownership precedence".
 */

export interface OwnerEffectiveUnit {
  unitId: string;
  unitNumber: string;
  status: UnitStatus;
  ownershipPercentage: Prisma.Decimal;
  sourceLevel: AssetLevel;
  floorId: string;
  floorName: string | null;
  buildingId: string;
  buildingName: string;
  buildingNameAr: string | null;
  compoundId: string;
  compoundName: string;
  compoundArabicName: string | null;
}

type OwnershipRowWithScope = OwnershipRow & { compoundId: string | null; buildingId: string | null; unitId: string | null };

function groupOwnershipByLevel(rows: OwnershipRowWithScope[]) {
  const byLevel = (level: AssetLevel) => {
    const map = new Map<string, OwnershipRow[]>();
    for (const row of rows) {
      const key = level === "COMPOUND" ? row.compoundId : level === "BUILDING" ? row.buildingId : row.unitId;
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push({ id: row.id, ownerId: row.ownerId, ownershipPercentage: row.ownershipPercentage });
      map.set(key, list);
    }
    return map;
  };
  return { byUnit: byLevel("UNIT"), byBuilding: byLevel("BUILDING"), byCompound: byLevel("COMPOUND") };
}

/**
 * Every Unit the given owner effectively owns across the organization,
 * following the exact Unit -> Building -> Compound override chain: a unit
 * with its own ownership record never inherits from its building/compound,
 * even when this owner owns the parent asset (the "Owner A owns the
 * Compound at 60%, Unit 101 is explicitly owned entirely by Owner B" case -
 * Owner A never gains access to Unit 101 through this function).
 */
export async function resolveOwnerEffectiveUnits(organizationId: string, ownerId: string): Promise<OwnerEffectiveUnit[]> {
  const [ownershipRows, units] = await Promise.all([
    prisma.propertyOwnership.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: { id: true, ownerId: true, ownershipPercentage: true, compoundId: true, buildingId: true, unitId: true },
    }),
    prisma.unit.findMany({
      where: { organizationId },
      select: {
        id: true,
        unitNumber: true,
        status: true,
        floor: {
          select: {
            id: true,
            name: true,
            building: { select: { id: true, name: true, nameAr: true, compound: { select: { id: true, name: true, arabicName: true } } } },
          },
        },
      },
    }),
  ]);

  const { byUnit, byBuilding, byCompound } = groupOwnershipByLevel(ownershipRows);

  const result: OwnerEffectiveUnit[] = [];
  for (const unit of units) {
    const building = unit.floor.building;
    const compound = building.compound;
    const effective = pickEffectiveOwnershipLevel([
      { level: "UNIT", rows: byUnit.get(unit.id) ?? [] },
      { level: "BUILDING", rows: byBuilding.get(building.id) ?? [] },
      { level: "COMPOUND", rows: byCompound.get(compound.id) ?? [] },
    ]);
    const mine = effective.find((o) => o.ownerId === ownerId);
    if (!mine) continue;
    result.push({
      unitId: unit.id,
      unitNumber: unit.unitNumber,
      status: unit.status,
      ownershipPercentage: mine.ownershipPercentage,
      sourceLevel: mine.sourceLevel,
      floorId: unit.floor.id,
      floorName: unit.floor.name,
      buildingId: building.id,
      buildingName: building.name,
      buildingNameAr: building.nameAr,
      compoundId: compound.id,
      compoundName: compound.name,
      compoundArabicName: compound.arabicName,
    });
  }
  return result;
}

export interface OwnerEffectiveScope {
  unitIds: Set<string>;
  /** Buildings this owner is entitled to at the BUILDING level itself (own building-level record, or inherited because the whole parent Compound is theirs and the building has no override) - used to gate building-scoped resources like a building-wide Maintenance Request, never unit-derived. */
  buildingIds: Set<string>;
  /** Compounds this owner is entitled to at the COMPOUND level itself - used to gate compound-scoped resources. */
  compoundIds: Set<string>;
}

/**
 * The Building/Compound-level counterpart to resolveOwnerEffectiveUnits() -
 * needed because a Maintenance Request can be scoped to an entire Building
 * or Compound (no unitId at all), and that entitlement question ("does this
 * owner own the whole building/compound") is a different, coarser check
 * than "does this owner own this specific unit" (mirrors
 * requireOwnerBuildingAccess()/requireOwnerCompoundAccess() in
 * src/lib/owner-session.ts exactly, just batched for a list view instead of
 * one asset at a time).
 */
export async function resolveOwnerEffectiveScope(organizationId: string, ownerId: string): Promise<OwnerEffectiveScope> {
  const [ownershipRows, buildings, compounds, units] = await Promise.all([
    prisma.propertyOwnership.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: { id: true, ownerId: true, ownershipPercentage: true, compoundId: true, buildingId: true, unitId: true },
    }),
    prisma.building.findMany({ where: { organizationId }, select: { id: true, compoundId: true } }),
    prisma.compound.findMany({ where: { organizationId }, select: { id: true } }),
    resolveOwnerEffectiveUnits(organizationId, ownerId),
  ]);

  const { byBuilding, byCompound } = groupOwnershipByLevel(ownershipRows);

  const compoundIds = new Set<string>();
  for (const compound of compounds) {
    const effective = pickEffectiveOwnershipLevel([{ level: "COMPOUND", rows: byCompound.get(compound.id) ?? [] }]);
    if (effective.some((o) => o.ownerId === ownerId)) compoundIds.add(compound.id);
  }

  const buildingIds = new Set<string>();
  for (const building of buildings) {
    const effective = pickEffectiveOwnershipLevel([
      { level: "BUILDING", rows: byBuilding.get(building.id) ?? [] },
      { level: "COMPOUND", rows: byCompound.get(building.compoundId) ?? [] },
    ]);
    if (effective.some((o) => o.ownerId === ownerId)) buildingIds.add(building.id);
  }

  return { unitIds: new Set(units.map((u) => u.unitId)), buildingIds, compoundIds };
}
