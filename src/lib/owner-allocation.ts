import { Prisma, type PrismaClient } from "@prisma/client";
import type { OwnerLedgerEntryType } from "@prisma/client";
import { getEffectiveOwners, type AssetLevel } from "@/lib/ownership";

type Tx = Prisma.TransactionClient | PrismaClient;

export interface OwnerShare {
  ownerId: string;
  /** 0-100 */
  percentage: Prisma.Decimal;
}

export interface OwnerAllocation {
  ownerId: string;
  amount: Prisma.Decimal;
}

/**
 * Splits `totalAmount` across `shares` proportionally to each share's
 * percentage, using Prisma.Decimal throughout (never JS floating-point
 * math) and the largest-remainder method so the allocated amounts always
 * sum EXACTLY to totalAmount - the last cent(s) of rounding go to whichever
 * owner(s) had the largest fractional remainder, with ties broken
 * deterministically by ownerId so the result is reproducible.
 */
export function allocateAmountToOwners(totalAmount: Prisma.Decimal | number | string, shares: OwnerShare[]): OwnerAllocation[] {
  const total = new Prisma.Decimal(totalAmount);
  if (shares.length === 0) return [];

  const raw = shares.map((s) => ({
    ownerId: s.ownerId,
    exact: total.times(s.percentage).dividedBy(100),
  }));

  const floored = raw.map((r) => ({
    ownerId: r.ownerId,
    floor: r.exact.toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN),
    remainder: r.exact.minus(r.exact.toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN)),
  }));

  const flooredSum = floored.reduce((sum, f) => sum.plus(f.floor), new Prisma.Decimal(0));
  // Total cents left to distribute (positive, since flooring only ever rounds down).
  let remainingCents = total.minus(flooredSum).dividedBy("0.01").toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();

  const order = [...floored].sort((a, b) => {
    const cmp = b.remainder.comparedTo(a.remainder);
    return cmp !== 0 ? cmp : a.ownerId.localeCompare(b.ownerId);
  });

  const bonusByOwnerId = new Map<string, Prisma.Decimal>();
  for (const entry of order) {
    if (remainingCents <= 0) break;
    bonusByOwnerId.set(entry.ownerId, new Prisma.Decimal("0.01"));
    remainingCents -= 1;
  }

  return floored.map((f) => ({
    ownerId: f.ownerId,
    amount: f.floor.plus(bonusByOwnerId.get(f.ownerId) ?? new Prisma.Decimal(0)),
  }));
}

const CREDIT_ENTRY_TYPES = new Set<OwnerLedgerEntryType>(["RENT_INCOME", "OTHER_INCOME", "OWNER_CONTRIBUTION"]);
const DEBIT_ENTRY_TYPES = new Set<OwnerLedgerEntryType>([
  "MANAGEMENT_FEE",
  "MAINTENANCE_EXPENSE",
  "UTILITY_EXPENSE",
  "SERVICE_EXPENSE",
  "GOVERNMENT_FEE",
  "OTHER_EXPENSE",
  "OWNER_DISTRIBUTION",
]);

/** Which ledger column a given entry type posts to by default (see docs/OWNERSHIP-ACCOUNTING.md, "Debit/credit convention"). ADJUSTMENT/REVERSAL are posted explicitly by their callers instead, since their side depends on what they're adjusting/reversing. */
export function defaultLedgerSide(entryType: OwnerLedgerEntryType): "debit" | "credit" {
  if (CREDIT_ENTRY_TYPES.has(entryType)) return "credit";
  if (DEBIT_ENTRY_TYPES.has(entryType)) return "debit";
  throw new Error(`No default ledger side for entry type ${entryType} - post it explicitly`);
}

export interface AllocateToOwnersInput {
  organizationId: string;
  assetLevel: AssetLevel;
  assetId: string;
  entryType: OwnerLedgerEntryType;
  amount: Prisma.Decimal | number | string;
  entryDate: Date;
  description: string;
  descriptionAr?: string;
  referenceType?: string;
  referenceId?: string;
  createdBy?: string;
}

export interface AllocationResult {
  allocations: OwnerAllocation[];
  createdEntryIds: string[];
}

/**
 * Resolves the effective owners of `assetId` (via getEffectiveOwners,
 * respecting inheritance) and posts one ledger entry per owner for their
 * proportional share of `amount`. Returns an empty allocation with no
 * entries created when the asset has no ownership configured yet - that is
 * an expected, non-error state (see docs/OWNERSHIP-ACCOUNTING.md).
 *
 * This does NOT touch any Invoice/Payment/PaymentSchedule row - it is a
 * manual/service-triggered posting, never an automatic side effect of the
 * existing invoicing pipeline.
 */
async function allocateToOwners(
  tx: Tx,
  input: AllocateToOwnersInput,
  side: "debit" | "credit"
): Promise<AllocationResult> {
  const owners = await getEffectiveOwners(tx, input.organizationId, input.assetLevel, input.assetId, input.entryDate);
  if (owners.length === 0) {
    return { allocations: [], createdEntryIds: [] };
  }

  const allocations = allocateAmountToOwners(
    input.amount,
    owners.map((o) => ({ ownerId: o.ownerId, percentage: o.ownershipPercentage }))
  );

  const compoundId = input.assetLevel === "COMPOUND" ? input.assetId : undefined;
  const unitId = input.assetLevel === "UNIT" ? input.assetId : undefined;

  const createdEntryIds: string[] = [];
  for (const allocation of allocations) {
    if (allocation.amount.isZero()) continue;
    const entry = await tx.ownerLedgerEntry.create({
      data: {
        organizationId: input.organizationId,
        ownerId: allocation.ownerId,
        entryType: input.entryType,
        referenceType: input.referenceType ?? "ALLOCATION",
        referenceId: input.referenceId,
        description: input.description,
        descriptionAr: input.descriptionAr,
        debit: side === "debit" ? allocation.amount : new Prisma.Decimal(0),
        credit: side === "credit" ? allocation.amount : new Prisma.Decimal(0),
        entryDate: input.entryDate,
        compoundId,
        unitId,
        createdBy: input.createdBy,
      },
      select: { id: true },
    });
    createdEntryIds.push(entry.id);
  }

  return { allocations, createdEntryIds };
}

/** Allocates income (rent, other income) to the asset's effective owners as CREDIT ledger entries. */
export async function allocateIncomeToOwners(tx: Tx, input: AllocateToOwnersInput): Promise<AllocationResult> {
  return allocateToOwners(tx, input, "credit");
}

/** Allocates an expense (management fee, maintenance, utilities, ...) to the asset's effective owners as DEBIT ledger entries. */
export async function allocateExpenseToOwners(tx: Tx, input: AllocateToOwnersInput): Promise<AllocationResult> {
  return allocateToOwners(tx, input, "debit");
}
