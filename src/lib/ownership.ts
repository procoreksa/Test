import { Prisma, type PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

export type AssetLevel = "COMPOUND" | "BUILDING" | "UNIT";

export interface OwnershipRow {
  id: string;
  ownerId: string;
  ownershipPercentage: Prisma.Decimal;
}

export interface EffectiveOwnershipRow extends OwnershipRow {
  /** Which level in the hierarchy this ownership record actually lives at - the level requested may be lower and simply inherit it. */
  sourceLevel: AssetLevel;
}

/**
 * Ownership inheritance priority: Unit -> Building -> Compound. Given the
 * ownership rows found at each level (closest first), returns the first
 * non-empty level's rows - i.e. a unit with its own ownership record never
 * inherits from its building/compound, but a unit with none does.
 *
 * Pure and DB-free on purpose (see src/lib/ownership.test.ts): this is the
 * actual inheritance decision, isolated from the Prisma queries that fetch
 * each level's candidate rows.
 */
export function pickEffectiveOwnershipLevel(
  candidatesByLevel: Array<{ level: AssetLevel; rows: OwnershipRow[] }>
): EffectiveOwnershipRow[] {
  for (const { level, rows } of candidatesByLevel) {
    if (rows.length > 0) {
      return rows.map((r) => ({ ...r, sourceLevel: level }));
    }
  }
  return [];
}

async function activeOwnershipRows(
  tx: Tx,
  organizationId: string,
  where: { compoundId?: string; buildingId?: string; unitId?: string },
  asOfDate: Date
): Promise<OwnershipRow[]> {
  return tx.propertyOwnership.findMany({
    where: {
      organizationId,
      ...where,
      status: "ACTIVE",
      effectiveFrom: { lte: asOfDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOfDate } }],
    },
    select: { id: true, ownerId: true, ownershipPercentage: true },
  });
}

/**
 * Resolves the effective owner(s) of a Compound, Building, or Unit as of a
 * given date (defaults to now), following the inheritance chain
 * Unit -> Building -> Compound without ever duplicating a compound-level
 * ownership record onto every one of its units - the closer level is
 * queried first, and only falls through to the parent level when the closer
 * level has no active ownership record at all.
 *
 * Returns an empty array when nothing has been configured anywhere in the
 * chain - "no ownership information configured" is an expected, valid state
 * for any pre-existing asset (see docs/OWNERSHIP-ACCOUNTING.md).
 */
export async function getEffectiveOwners(
  tx: Tx,
  organizationId: string,
  level: AssetLevel,
  assetId: string,
  asOfDate: Date = new Date()
): Promise<EffectiveOwnershipRow[]> {
  if (level === "UNIT") {
    const unitRows = await activeOwnershipRows(tx, organizationId, { unitId: assetId }, asOfDate);
    if (unitRows.length > 0) return unitRows.map((r) => ({ ...r, sourceLevel: "UNIT" as const }));

    const unit = await tx.unit.findUnique({
      where: { id: assetId, organizationId },
      select: { floor: { select: { buildingId: true } } },
    });
    if (!unit) return [];
    return getEffectiveOwners(tx, organizationId, "BUILDING", unit.floor.buildingId, asOfDate);
  }

  if (level === "BUILDING") {
    const buildingRows = await activeOwnershipRows(tx, organizationId, { buildingId: assetId }, asOfDate);
    if (buildingRows.length > 0) return buildingRows.map((r) => ({ ...r, sourceLevel: "BUILDING" as const }));

    const building = await tx.building.findUnique({
      where: { id: assetId, organizationId },
      select: { compoundId: true },
    });
    if (!building) return [];
    return getEffectiveOwners(tx, organizationId, "COMPOUND", building.compoundId, asOfDate);
  }

  const compoundRows = await activeOwnershipRows(tx, organizationId, { compoundId: assetId }, asOfDate);
  return compoundRows.map((r) => ({ ...r, sourceLevel: "COMPOUND" as const }));
}

/**
 * Sum of ACTIVE ownershipPercentage values already assigned to the exact
 * same asset (same level + id) - used to enforce the "never exceed 100%"
 * rule before inserting a new ownership record. Deliberately does NOT sum
 * across the hierarchy (a unit's own ownership total is independent of its
 * building's/compound's).
 */
export async function activeOwnershipTotalForAsset(
  tx: Tx,
  organizationId: string,
  level: AssetLevel,
  assetId: string,
  excludeOwnershipId?: string
): Promise<Prisma.Decimal> {
  const where =
    level === "COMPOUND" ? { compoundId: assetId } : level === "BUILDING" ? { buildingId: assetId } : { unitId: assetId };

  const rows = await tx.propertyOwnership.findMany({
    where: { organizationId, ...where, status: "ACTIVE", id: excludeOwnershipId ? { not: excludeOwnershipId } : undefined },
    select: { ownershipPercentage: true },
  });

  return rows.reduce((sum, r) => sum.plus(r.ownershipPercentage), new Prisma.Decimal(0));
}
