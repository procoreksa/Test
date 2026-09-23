"use server";

import { prisma } from "@/lib/prisma";
import { requireOwnerPrincipal } from "@/lib/owner-session";
import { summarizeOwnerLedgerEntries, buildOwnerStatement } from "@/lib/owner-ledger-rules";

/**
 * Owner Portal financials - strictly OwnerLedgerEntry-based (Step 21/54-66).
 * No query in this file ever reads Invoice/Payment/Contract/MaintenanceRequest
 * cost fields to compute a financial figure; every number here is either a
 * direct ledger row or a pure aggregation of ledger rows via
 * summarizeOwnerLedgerEntries()/buildOwnerStatement() (src/lib/owner-ledger-rules.ts)
 * - the same shared math the internal getOwnerBalance()/getOwnerStatement()
 * reports already use, never a second, divergent accounting engine.
 */

const LEDGER_ROW_SELECT = {
  id: true,
  entryType: true,
  description: true,
  descriptionAr: true,
  debit: true,
  credit: true,
  entryDate: true,
  compoundId: true,
  unitId: true,
} as const;

/**
 * Owner-safe ledger row shape (Step 30): deliberately omits
 * referenceType/referenceId (internal metadata pointing at whatever posted
 * the entry) and any actor/staff detail - only Date/Type/Description/
 * Property reference/Debit/Credit/Running Balance are ever shown.
 */
async function resolveLedgerPropertyLabel(organizationId: string, compoundId: string | null, unitId: string | null): Promise<string | null> {
  if (unitId) {
    const unit = await prisma.unit.findFirst({ where: { id: unitId, organizationId }, select: { unitNumber: true } });
    return unit?.unitNumber ?? null;
  }
  if (compoundId) {
    const compound = await prisma.compound.findFirst({ where: { id: compoundId, organizationId }, select: { name: true } });
    return compound?.name ?? null;
  }
  return null;
}

export async function getOwnerPortalFinancialSummary() {
  const { organizationId, ownerId } = await requireOwnerPrincipal();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const [allEntries, monthEntries, yearEntries, recentEntries] = await Promise.all([
    prisma.ownerLedgerEntry.findMany({ where: { organizationId, ownerId }, select: { entryType: true, debit: true, credit: true } }),
    prisma.ownerLedgerEntry.findMany({ where: { organizationId, ownerId, entryDate: { gte: monthStart } }, select: { entryType: true, debit: true, credit: true } }),
    prisma.ownerLedgerEntry.findMany({ where: { organizationId, ownerId, entryDate: { gte: yearStart } }, select: { entryType: true, debit: true, credit: true } }),
    prisma.ownerLedgerEntry.findMany({ where: { organizationId, ownerId }, orderBy: { entryDate: "desc" }, take: 10, select: LEDGER_ROW_SELECT }),
  ]);

  const allTime = summarizeOwnerLedgerEntries(allEntries);
  const monthToDate = summarizeOwnerLedgerEntries(monthEntries);
  const yearToDate = summarizeOwnerLedgerEntries(yearEntries);

  const recent = await Promise.all(
    recentEntries.map(async (e) => ({
      id: e.id,
      entryType: e.entryType,
      description: e.description,
      descriptionAr: e.descriptionAr,
      debit: e.debit,
      credit: e.credit,
      entryDate: e.entryDate,
      propertyLabel: await resolveLedgerPropertyLabel(organizationId, e.compoundId, e.unitId),
    }))
  );

  return {
    currentBalance: allTime.balance,
    monthToDateIncome: monthToDate.totalIncome,
    monthToDateExpenses: monthToDate.totalExpenses,
    yearToDateIncome: yearToDate.totalIncome,
    yearToDateExpenses: yearToDate.totalExpenses,
    netMovement: monthToDate.totalIncome.minus(monthToDate.totalExpenses),
    recentEntries: recent,
  };
}

/** Owner Ledger (full list, no date range) - entitlement is `ownerId` match only, never asset-based (see requireOwnerLedgerAccess() in src/lib/owner-session.ts for the single-entry equivalent). */
export async function getOwnerPortalLedger() {
  const { organizationId, ownerId } = await requireOwnerPrincipal();
  const entries = await prisma.ownerLedgerEntry.findMany({
    where: { organizationId, ownerId },
    orderBy: { entryDate: "desc" },
    select: LEDGER_ROW_SELECT,
  });

  const summary = summarizeOwnerLedgerEntries(entries);

  const rows = await Promise.all(
    entries.map(async (e) => ({
      id: e.id,
      entryType: e.entryType,
      description: e.description,
      descriptionAr: e.descriptionAr,
      debit: e.debit,
      credit: e.credit,
      entryDate: e.entryDate,
      propertyLabel: await resolveLedgerPropertyLabel(organizationId, e.compoundId, e.unitId),
    }))
  );

  return { rows, balance: summary.balance };
}

export interface OwnerPortalStatementFilters {
  from?: Date;
  to?: Date;
}

/**
 * Owner Statement (Step 31-33). Always generated for the AUTHENTICATED
 * owner from their own session - `ownerId` is never accepted as a
 * parameter here, so there is nothing for a hostile client to pass in a
 * URL/form to request another owner's statement.
 */
export async function getOwnerPortalStatement(filters: OwnerPortalStatementFilters) {
  const { organizationId, ownerId } = await requireOwnerPrincipal();
  const scopeWhere = { organizationId, ownerId };

  const [openingEntries, periodEntries] = await Promise.all([
    filters.from
      ? prisma.ownerLedgerEntry.findMany({ where: { ...scopeWhere, entryDate: { lt: filters.from } }, select: { debit: true, credit: true } })
      : Promise.resolve([]),
    prisma.ownerLedgerEntry.findMany({
      where: { ...scopeWhere, entryDate: { gte: filters.from, lte: filters.to } },
      orderBy: { entryDate: "asc" },
      select: LEDGER_ROW_SELECT,
    }),
  ]);

  const statement = buildOwnerStatement(openingEntries, periodEntries);

  const rows = await Promise.all(
    statement.rows.map(async (row, i) => ({
      date: row.date,
      description: row.description,
      descriptionAr: row.descriptionAr,
      debit: row.debit,
      credit: row.credit,
      runningBalance: row.runningBalance,
      propertyLabel: await resolveLedgerPropertyLabel(organizationId, periodEntries[i].compoundId, periodEntries[i].unitId),
    }))
  );

  return {
    rows,
    openingBalance: statement.openingBalance,
    closingBalance: statement.closingBalance,
    totalIncome: statement.totalIncome,
    totalExpenses: statement.totalExpenses,
    totalDistributions: statement.totalDistributions,
    netMovement: statement.netMovement,
    from: filters.from ?? null,
    to: filters.to ?? null,
  };
}
