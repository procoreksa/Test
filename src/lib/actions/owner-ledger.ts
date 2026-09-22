"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { OwnerLedgerEntryType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";
import { defaultLedgerSide, allocateIncomeToOwners, allocateExpenseToOwners } from "@/lib/owner-allocation";
import type { AssetLevel } from "@/lib/ownership";
import { auditCreate, auditAction, requirePermissionAudited } from "@/lib/audit";

const MANUAL_ENTRY_TYPES = [
  "RENT_INCOME",
  "OTHER_INCOME",
  "MANAGEMENT_FEE",
  "MAINTENANCE_EXPENSE",
  "UTILITY_EXPENSE",
  "SERVICE_EXPENSE",
  "GOVERNMENT_FEE",
  "OTHER_EXPENSE",
  "OWNER_CONTRIBUTION",
  "OWNER_DISTRIBUTION",
  "ADJUSTMENT",
] as const satisfies readonly OwnerLedgerEntryType[];

const INCOME_OR_EXPENSE_TYPES = [
  "RENT_INCOME",
  "OTHER_INCOME",
  "MANAGEMENT_FEE",
  "MAINTENANCE_EXPENSE",
  "UTILITY_EXPENSE",
  "SERVICE_EXPENSE",
  "GOVERNMENT_FEE",
  "OTHER_EXPENSE",
] as const satisfies readonly OwnerLedgerEntryType[];

const INCOME_TYPES = new Set<OwnerLedgerEntryType>(["RENT_INCOME", "OTHER_INCOME"]);

/** Manual single-owner posting - e.g. a distribution paid out, or a contribution received. */
export async function postManualLedgerEntry(formData: FormData) {
  const { organizationId } = await requirePermission("ownerLedger.create");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const schema = z.object({
    ownerId: z.string().min(1),
    entryType: z.enum(MANUAL_ENTRY_TYPES),
    side: z.enum(["debit", "credit"]).optional(),
    amount: z.coerce.number().positive(t.validation.rentAmountPositive),
    entryDate: z.coerce.date(),
    description: z.string().min(1, t.validation.nameRequired),
    descriptionAr: z.string().optional(),
    compoundId: z.string().optional(),
    unitId: z.string().optional(),
  });

  const parsed = schema.parse({
    ownerId: formData.get("ownerId"),
    entryType: formData.get("entryType"),
    side: formData.get("side") || undefined,
    amount: formData.get("amount"),
    entryDate: formData.get("entryDate") || new Date(),
    description: formData.get("description"),
    descriptionAr: formData.get("descriptionAr") || undefined,
    compoundId: formData.get("compoundId") || undefined,
    unitId: formData.get("unitId") || undefined,
  });

  const owner = await prisma.owner.findUniqueOrThrow({ where: { id: parsed.ownerId, organizationId } });
  // compoundId/unitId are optional tagging fields, not permission-gated
  // lookups elsewhere - without this check a caller could tag their own
  // ledger entry with another organization's compound/unit id. Verify each
  // belongs to the caller's own organization before it's ever persisted.
  if (parsed.compoundId) {
    await prisma.compound.findUniqueOrThrow({ where: { id: parsed.compoundId, organizationId } });
  }
  if (parsed.unitId) {
    await prisma.unit.findUniqueOrThrow({ where: { id: parsed.unitId, organizationId } });
  }
  const side = parsed.entryType === "ADJUSTMENT" ? (parsed.side ?? "debit") : defaultLedgerSide(parsed.entryType);
  const amount = new Prisma.Decimal(parsed.amount);

  const entryId = await prisma.$transaction(async (tx) => {
    const entry = await tx.ownerLedgerEntry.create({
      data: {
        organizationId,
        ownerId: parsed.ownerId,
        entryType: parsed.entryType,
        referenceType: "MANUAL",
        description: parsed.description,
        descriptionAr: parsed.descriptionAr,
        debit: side === "debit" ? amount : new Prisma.Decimal(0),
        credit: side === "credit" ? amount : new Prisma.Decimal(0),
        entryDate: parsed.entryDate,
        compoundId: parsed.compoundId,
        unitId: parsed.unitId,
        createdBy: user.id,
      },
    });

    await auditCreate(tx, {
      action: "LEDGER_POSTED",
      entityType: "OwnerLedgerEntry",
      entityId: entry.id,
      entityDisplayName: `${owner.name} - ${parsed.entryType}`,
      newValues: {
        ownerId: parsed.ownerId,
        entryType: parsed.entryType,
        debit: entry.debit,
        credit: entry.credit,
        entryDate: parsed.entryDate,
        description: parsed.description,
      },
    });

    return entry.id;
  });

  revalidatePath(`/owners/${parsed.ownerId}`);
  return entryId;
}

/**
 * Splits a single income/expense amount across an asset's effective owners
 * (per docs/OWNERSHIP-ACCOUNTING.md, "Financial allocation") and posts one
 * ledger entry per owner. This is a manual/service-triggered posting - it
 * does not read from or write to any Invoice/Payment/PaymentSchedule row.
 */
export async function allocateToOwnersAction(formData: FormData) {
  const { organizationId } = await requirePermission("ownerLedger.create");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const schema = z.object({
    assetLevel: z.enum(["COMPOUND", "BUILDING", "UNIT"]),
    assetId: z.string().min(1),
    entryType: z.enum(INCOME_OR_EXPENSE_TYPES),
    amount: z.coerce.number().positive(t.validation.rentAmountPositive),
    entryDate: z.coerce.date(),
    description: z.string().min(1, t.validation.nameRequired),
    descriptionAr: z.string().optional(),
  });

  const parsed = schema.parse({
    assetLevel: formData.get("assetLevel"),
    assetId: formData.get("assetId"),
    entryType: formData.get("entryType"),
    amount: formData.get("amount"),
    entryDate: formData.get("entryDate") || new Date(),
    description: formData.get("description"),
    descriptionAr: formData.get("descriptionAr") || undefined,
  });

  const allocate = INCOME_TYPES.has(parsed.entryType) ? allocateIncomeToOwners : allocateExpenseToOwners;

  const result = await prisma.$transaction(async (tx) => {
    const allocationResult = await allocate(tx, {
      organizationId,
      assetLevel: parsed.assetLevel as AssetLevel,
      assetId: parsed.assetId,
      entryType: parsed.entryType,
      amount: parsed.amount,
      entryDate: parsed.entryDate,
      description: parsed.description,
      descriptionAr: parsed.descriptionAr,
      createdBy: user.id,
    });

    if (allocationResult.createdEntryIds.length > 0) {
      await auditAction(tx, {
        action: "LEDGER_POSTED",
        entityType: "OwnerLedgerEntry",
        entityId: allocationResult.createdEntryIds[0],
        entityDisplayName: `Allocation - ${parsed.entryType} - ${parsed.assetLevel} ${parsed.assetId}`,
        newValues: {
          assetLevel: parsed.assetLevel,
          assetId: parsed.assetId,
          entryType: parsed.entryType,
          totalAmount: parsed.amount,
          allocations: allocationResult.allocations.map((a) => ({ ownerId: a.ownerId, amount: a.amount })),
          createdEntryIds: allocationResult.createdEntryIds,
        },
      });
    }

    return allocationResult;
  });

  if (parsed.assetLevel === "COMPOUND") revalidatePath(`/compounds/${parsed.assetId}/ownership`);
  if (parsed.assetLevel === "BUILDING") revalidatePath(`/buildings/${parsed.assetId}/ownership`);
  if (parsed.assetLevel === "UNIT") revalidatePath(`/units/${parsed.assetId}/ownership`);

  return result;
}

/**
 * Corrects a posted entry by creating a new REVERSAL entry with debit/credit
 * swapped - the original entry is never edited or deleted. An entry can be
 * reversed at most once (reversalOfEntryId is unique).
 */
export async function reverseLedgerEntry(entryId: string) {
  const { organizationId } = await requirePermissionAudited("ownerLedger.reverse", "OwnerLedgerEntry", entryId);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  return prisma.$transaction(async (tx) => {
    const original = await tx.ownerLedgerEntry.findUniqueOrThrow({ where: { id: entryId, organizationId } });

    const alreadyReversed = await tx.ownerLedgerEntry.findUnique({ where: { reversalOfEntryId: entryId } });
    if (alreadyReversed) {
      throw new Error(t.validation.ledgerAlreadyReversed);
    }

    const reversal = await tx.ownerLedgerEntry.create({
      data: {
        organizationId,
        ownerId: original.ownerId,
        entryType: "REVERSAL",
        referenceType: "OwnerLedgerEntry",
        referenceId: original.id,
        description: `Reversal of: ${original.description}`,
        descriptionAr: original.descriptionAr ? `عكس قيد: ${original.descriptionAr}` : undefined,
        debit: original.credit,
        credit: original.debit,
        entryDate: new Date(),
        compoundId: original.compoundId,
        unitId: original.unitId,
        reversalOfEntryId: original.id,
        createdBy: user.id,
      },
    });

    await auditAction(tx, {
      action: "LEDGER_REVERSED",
      entityType: "OwnerLedgerEntry",
      entityId: original.id,
      entityDisplayName: original.description,
      previousValues: { debit: original.debit, credit: original.credit },
      newValues: { reversalEntryId: reversal.id, reversalDebit: reversal.debit, reversalCredit: reversal.credit },
    });

    revalidatePath(`/owners/${original.ownerId}`);
    return reversal.id;
  });
}

/** Ledger entries for one owner, optionally filtered by date range/compound/unit - used by the Owner Statement report. */
export async function listOwnerLedger(
  ownerId: string,
  filters?: { from?: Date; to?: Date; compoundId?: string; unitId?: string }
) {
  const { organizationId } = await requirePermission("ownerLedger.view");
  return prisma.ownerLedgerEntry.findMany({
    where: {
      organizationId,
      ownerId,
      compoundId: filters?.compoundId,
      unitId: filters?.unitId,
      entryDate: {
        gte: filters?.from,
        lte: filters?.to,
      },
    },
    include: { reversedByEntry: { select: { id: true } } },
    orderBy: { entryDate: "asc" },
  });
}

export async function getOwnerBalance(ownerId: string) {
  const { organizationId } = await requirePermission("ownerLedger.view");
  const entries = await prisma.ownerLedgerEntry.findMany({
    where: { organizationId, ownerId },
    select: { debit: true, credit: true, entryType: true },
  });

  let totalIncome = new Prisma.Decimal(0);
  let totalExpenses = new Prisma.Decimal(0);
  let totalDistributions = new Prisma.Decimal(0);
  let balance = new Prisma.Decimal(0);

  for (const e of entries) {
    balance = balance.plus(e.credit).minus(e.debit);
    if (e.entryType === "RENT_INCOME" || e.entryType === "OTHER_INCOME") totalIncome = totalIncome.plus(e.credit);
    if (
      e.entryType === "MANAGEMENT_FEE" ||
      e.entryType === "MAINTENANCE_EXPENSE" ||
      e.entryType === "UTILITY_EXPENSE" ||
      e.entryType === "SERVICE_EXPENSE" ||
      e.entryType === "GOVERNMENT_FEE" ||
      e.entryType === "OTHER_EXPENSE"
    )
      totalExpenses = totalExpenses.plus(e.debit);
    if (e.entryType === "OWNER_DISTRIBUTION") totalDistributions = totalDistributions.plus(e.debit);
  }

  return { balance, totalIncome, totalExpenses, totalDistributions };
}
