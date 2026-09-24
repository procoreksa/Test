import { Prisma } from "@prisma/client";

/**
 * Decimal-safe aggregation/formatting helpers for the Executive Dashboards
 * module (Steps 48/64/65) - no existing helper in this codebase centralizes
 * "sum a list of Prisma.Decimal without floating-point error" or "percentage
 * with a defined zero-denominator result", so every domain module below
 * shares these two instead of re-deriving them ad hoc.
 */

/** Sums a list of Prisma.Decimal (or Decimal-like) values using Decimal arithmetic throughout - never `Number(a) + Number(b)`. */
export function sumDecimal(values: readonly Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((total, v) => total.plus(v), new Prisma.Decimal(0));
}

/**
 * Whole-percent rate with an explicit, centralized zero-denominator result
 * (0, matching computeOccupancySummary()/computeAllocationRate()'s own
 * existing convention - never NaN, never inferred per call site).
 */
export function safeRate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

/**
 * A Decimal money value crossing the server/client boundary as a plain
 * string (`toFixed(2)`), never a bare `number` - avoids the float precision
 * loss a Server Component -> Client Component prop serialization would
 * otherwise risk on large SAR amounts, and is parsed back with `Number()`
 * only at render time for display formatting via the existing
 * `currencyFormatter()`/`numberFormatter()` (src/lib/i18n/format.ts).
 */
export function serializeMoney(value: Prisma.Decimal | number): string {
  return new Prisma.Decimal(value).toFixed(2);
}
