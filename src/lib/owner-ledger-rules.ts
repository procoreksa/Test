import { Prisma } from "@prisma/client";
import type { OwnerLedgerEntryType } from "@prisma/client";

/**
 * The authoritative owner-ledger classification/balance math
 * (docs/OWNERSHIP-ACCOUNTING.md §5/§6, docs/OWNER-PORTAL.md "OwnerLedgerEntry
 * authority"). Extracted as pure, DB-free functions so
 * src/lib/actions/owner-ledger.ts's internal getOwnerBalance()/
 * src/lib/actions/owner-reports.ts's getOwnerStatement() and the Owner
 * Portal's own financial-summary/statement actions all share exactly one
 * implementation - never a second, possibly-conflicting sign convention or
 * income/expense classification.
 *
 * Sign convention: `balance = Σcredit − Σdebit`. "Income" is deliberately
 * narrower than "every credit" - only RENT_INCOME/OTHER_INCOME count,
 * matching this codebase's own pre-existing getOwnerBalance() precedent
 * (OWNER_CONTRIBUTION is a credit but is not "income"). "Expenses" are the
 * six operating-expense types' debits; OWNER_DISTRIBUTION is tracked
 * separately, never folded into "expenses" (it is a payout, not a cost).
 * ADJUSTMENT/REVERSAL entries affect `balance` like every other entry but
 * are deliberately excluded from both the income and expense buckets,
 * since their sign is contextual (mirrors the existing getOwnerBalance()
 * behavior exactly).
 */

const INCOME_TYPES = new Set<OwnerLedgerEntryType>(["RENT_INCOME", "OTHER_INCOME"]);
const EXPENSE_TYPES = new Set<OwnerLedgerEntryType>(["MANAGEMENT_FEE", "MAINTENANCE_EXPENSE", "UTILITY_EXPENSE", "SERVICE_EXPENSE", "GOVERNMENT_FEE", "OTHER_EXPENSE"]);

export interface LedgerEntryLike {
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  entryType: OwnerLedgerEntryType;
}

export interface OwnerLedgerSummary {
  balance: Prisma.Decimal;
  totalIncome: Prisma.Decimal;
  totalExpenses: Prisma.Decimal;
  totalDistributions: Prisma.Decimal;
}

/** All-time (or pre-filtered) balance/income/expense/distribution totals over a flat list of entries - the exact math getOwnerBalance() already implements. */
export function summarizeOwnerLedgerEntries(entries: LedgerEntryLike[]): OwnerLedgerSummary {
  let balance = new Prisma.Decimal(0);
  let totalIncome = new Prisma.Decimal(0);
  let totalExpenses = new Prisma.Decimal(0);
  let totalDistributions = new Prisma.Decimal(0);

  for (const e of entries) {
    balance = balance.plus(e.credit).minus(e.debit);
    if (INCOME_TYPES.has(e.entryType)) totalIncome = totalIncome.plus(e.credit);
    if (EXPENSE_TYPES.has(e.entryType)) totalExpenses = totalExpenses.plus(e.debit);
    if (e.entryType === "OWNER_DISTRIBUTION") totalDistributions = totalDistributions.plus(e.debit);
  }

  return { balance, totalIncome, totalExpenses, totalDistributions };
}

/** Sum of credit-minus-debit over every entry dated before the statement period - never zero-started (Step 33). */
export function computeOwnerOpeningBalance(entriesBeforePeriod: Array<{ debit: Prisma.Decimal; credit: Prisma.Decimal }>): Prisma.Decimal {
  return entriesBeforePeriod.reduce((sum, e) => sum.plus(e.credit).minus(e.debit), new Prisma.Decimal(0));
}

export interface OwnerStatementRowLike extends LedgerEntryLike {
  id: string;
  entryDate: Date;
  description: string;
  descriptionAr: string | null;
}

export interface OwnerStatementRowResult {
  id: string;
  date: Date;
  description: string;
  descriptionAr: string | null;
  entryType: OwnerLedgerEntryType;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  runningBalance: Prisma.Decimal;
}

export interface OwnerStatementResult {
  rows: OwnerStatementRowResult[];
  openingBalance: Prisma.Decimal;
  closingBalance: Prisma.Decimal;
  totalIncome: Prisma.Decimal;
  totalExpenses: Prisma.Decimal;
  totalDistributions: Prisma.Decimal;
  periodCredits: Prisma.Decimal;
  periodDebits: Prisma.Decimal;
  netMovement: Prisma.Decimal;
}

/**
 * Statement math: opening balance (entries strictly before the period) +
 * a running balance per dated row + closing totals - mirrors
 * getOwnerStatement()'s own row-mapping exactly (src/lib/actions/
 * owner-reports.ts), extracted so the internal report and the Owner
 * Portal's own statement action never diverge on the arithmetic. Period
 * entries must already be sorted ascending by entryDate by the caller (the
 * running balance is order-dependent).
 */
export function buildOwnerStatement(openingEntries: Array<{ debit: Prisma.Decimal; credit: Prisma.Decimal }>, periodEntries: OwnerStatementRowLike[]): OwnerStatementResult {
  const openingBalance = computeOwnerOpeningBalance(openingEntries);
  let running = openingBalance;
  let totalIncome = new Prisma.Decimal(0);
  let totalExpenses = new Prisma.Decimal(0);
  let totalDistributions = new Prisma.Decimal(0);
  let periodCredits = new Prisma.Decimal(0);
  let periodDebits = new Prisma.Decimal(0);

  const rows: OwnerStatementRowResult[] = periodEntries.map((e) => {
    running = running.plus(e.credit).minus(e.debit);
    periodCredits = periodCredits.plus(e.credit);
    periodDebits = periodDebits.plus(e.debit);
    if (INCOME_TYPES.has(e.entryType)) totalIncome = totalIncome.plus(e.credit);
    if (EXPENSE_TYPES.has(e.entryType)) totalExpenses = totalExpenses.plus(e.debit);
    if (e.entryType === "OWNER_DISTRIBUTION") totalDistributions = totalDistributions.plus(e.debit);
    return {
      id: e.id,
      date: e.entryDate,
      description: e.description,
      descriptionAr: e.descriptionAr,
      entryType: e.entryType,
      debit: e.debit,
      credit: e.credit,
      runningBalance: running,
    };
  });

  return {
    rows,
    openingBalance,
    closingBalance: running,
    totalIncome,
    totalExpenses,
    totalDistributions,
    periodCredits,
    periodDebits,
    netMovement: periodCredits.minus(periodDebits),
  };
}
