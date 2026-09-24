import { Prisma } from "@prisma/client";
import { differenceInCalendarDays } from "date-fns";

/**
 * Pure, DB-free formulas specific to the Executive Dashboards module - no
 * Prisma calls, safe to unit test directly (Step 79). Every formula here
 * that overlaps an existing domain concept (overdue, occupancy, allocation
 * rate, maintenance cost, owner-ledger balance) is deliberately NOT
 * redefined here - those live in their own pre-existing modules
 * (src/lib/actions/reports.ts, src/lib/owner-portfolio-rules.ts,
 * src/lib/corporate-housing-rules.ts, src/lib/operations/maintenance-rules.ts,
 * src/lib/owner-ledger-rules.ts) and are imported, never duplicated.
 */

// ---------------------------------------------------------------------------
// Receivables aging (Step 20) - due-date-based, outstanding-only.
// ---------------------------------------------------------------------------

export type AgingBucketKey = "CURRENT" | "DAYS_1_30" | "DAYS_31_60" | "DAYS_61_90" | "DAYS_90_PLUS" | "UNDATED";

export const AGING_BUCKET_KEYS: readonly AgingBucketKey[] = ["CURRENT", "DAYS_1_30", "DAYS_31_60", "DAYS_61_90", "DAYS_90_PLUS", "UNDATED"];

/**
 * Assigns exactly one bucket per invoice (by construction, so buckets always
 * sum to the outstanding total - the mandatory aging-reconciliation
 * invariant, Step 20/79). An invoice with no `dueDate` is bucketed UNDATED
 * rather than silently folded into CURRENT or dropped - a documented,
 * intentionally visible edge case (invoices are expected to carry a
 * dueDate; UNDATED should be rare/zero in practice).
 */
export function bucketReceivableAge(dueDate: Date | null, today: Date): AgingBucketKey {
  if (!dueDate) return "UNDATED";
  const daysPastDue = differenceInCalendarDays(today, dueDate);
  if (daysPastDue <= 0) return "CURRENT";
  if (daysPastDue <= 30) return "DAYS_1_30";
  if (daysPastDue <= 60) return "DAYS_31_60";
  if (daysPastDue <= 90) return "DAYS_61_90";
  return "DAYS_90_PLUS";
}

export interface AgingSummary {
  buckets: Record<AgingBucketKey, Prisma.Decimal>;
  bucketCounts: Record<AgingBucketKey, number>;
  total: Prisma.Decimal;
}

/** Buckets a set of (dueDate, outstandingBalance) rows - callers pre-filter to `outstandingBalance > 0` and exclude CANCELLED invoices, matching the Outstanding Receivables KPI's own definition exactly (never a second one here). */
export function aggregateReceivableAging(rows: readonly { dueDate: Date | null; outstanding: Prisma.Decimal }[], today: Date): AgingSummary {
  const buckets = Object.fromEntries(AGING_BUCKET_KEYS.map((k) => [k, new Prisma.Decimal(0)])) as Record<AgingBucketKey, Prisma.Decimal>;
  const bucketCounts = Object.fromEntries(AGING_BUCKET_KEYS.map((k) => [k, 0])) as Record<AgingBucketKey, number>;
  let total = new Prisma.Decimal(0);
  for (const row of rows) {
    const bucket = bucketReceivableAge(row.dueDate, today);
    buckets[bucket] = buckets[bucket].plus(row.outstanding);
    bucketCounts[bucket] += 1;
    total = total.plus(row.outstanding);
  }
  return { buckets, bucketCounts, total };
}

// ---------------------------------------------------------------------------
// Attention Center (Steps 55-58) - deterministic, non-AI severity rules.
// ---------------------------------------------------------------------------

export type AttentionSeverity = "INFO" | "WARNING" | "CRITICAL";

/** A single count against two fixed thresholds - the only "rule engine" the Attention Center has (Critical Principle: deterministic, never AI/ML). Returns null when the count doesn't clear the warning threshold (nothing to surface). */
export function classifyCountSeverity(count: number, warnAt: number, criticalAt: number): AttentionSeverity | null {
  if (count <= 0) return null;
  if (count >= criticalAt) return "CRITICAL";
  if (count >= warnAt) return "WARNING";
  return null;
}

export interface AttentionItem {
  key: string;
  severity: AttentionSeverity;
  count: number;
  drillDownRoute: string;
}
