/**
 * Pure CRM Viewing business rules, deliberately DB-free (same pattern as
 * src/lib/crm/lead-rules.ts and src/lib/ownership.ts) so overlap detection,
 * status-transition rules, and metric formulas are trivially unit-testable
 * without a database. The actual Prisma queries live in
 * src/lib/actions/viewings.ts.
 */
import type { ViewingStatus } from "@prisma/client";

/**
 * Only these statuses represent a real, still-active commitment of an
 * agent's time or a unit's showing slot - see docs/VIEWING-MANAGEMENT.md,
 * "Double-booking logic". CANCELLED/NO_SHOW/COMPLETED viewings free up
 * their slot entirely and must never block a new booking.
 */
export const BLOCKING_VIEWING_STATUSES: readonly ViewingStatus[] = ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"];

export function isBlockingViewingStatus(status: ViewingStatus): boolean {
  return BLOCKING_VIEWING_STATUSES.includes(status);
}

/**
 * Two time ranges overlap iff each starts before the other ends. A range
 * that starts exactly when another ends does NOT overlap (back-to-back
 * bookings are allowed) - see docs/VIEWING-MANAGEMENT.md, "boundary case".
 */
export function hasTimeOverlap(existingStart: Date, existingEnd: Date, newStart: Date, newEnd: Date): boolean {
  return existingStart < newEnd && existingEnd > newStart;
}

/**
 * Centralized status-transition table (Step 10/31) - the single source of
 * truth for which moves are legal, so no action file re-implements this
 * logic ad hoc. COMPLETED/CANCELLED/NO_SHOW are terminal. RESCHEDULED is
 * transient: rescheduleViewing() moves a viewing into it and immediately
 * back out to SCHEDULED/CONFIRMED within the same transaction, so it never
 * persists as a lingering status a user sees.
 */
const VIEWING_TRANSITIONS: Record<ViewingStatus, readonly ViewingStatus[]> = {
  SCHEDULED: ["CONFIRMED", "CANCELLED", "NO_SHOW", "RESCHEDULED"],
  CONFIRMED: ["IN_PROGRESS", "CANCELLED", "NO_SHOW", "RESCHEDULED"],
  IN_PROGRESS: ["COMPLETED", "RESCHEDULED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
  RESCHEDULED: ["SCHEDULED", "CONFIRMED"],
};

export function isValidViewingTransition(from: ViewingStatus, to: ViewingStatus): boolean {
  return VIEWING_TRANSITIONS[from]?.includes(to) ?? false;
}

/** True for SCHEDULED/CONFIRMED/IN_PROGRESS - the statuses reschedule/cancel/no-show can act on (see docs/VIEWING-MANAGEMENT.md). */
export function isActiveViewingStatus(status: ViewingStatus): boolean {
  return isBlockingViewingStatus(status);
}

// ---------------------------------------------------------------------------
// Metrics - see docs/VIEWING-MANAGEMENT.md, "Metric definitions", for the
// authoritative formulas. Every rate returns 0 (never NaN) when its
// denominator is 0, matching computeConversionRate()'s convention in
// src/lib/crm/lead-rules.ts.
// ---------------------------------------------------------------------------

function ratePercent(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** Completed / (Completed + Cancelled + No-Show). Viewings still scheduled/confirmed/in-progress are excluded from the denominator - they haven't reached an end state yet. */
export function computeViewingCompletionRate(completed: number, cancelled: number, noShow: number): number {
  return ratePercent(completed, completed + cancelled + noShow);
}

/** Any completed-viewing outcome rate = (completed viewings with that outcome) / (all completed viewings). Covers Interest Rate, Offer Request Rate, and Reservation Request Rate with one formula. */
export function computeOutcomeRate(outcomeCount: number, completedCount: number): number {
  return ratePercent(outcomeCount, completedCount);
}

// ---------------------------------------------------------------------------
// Date bucketing (Step 18 filters / Step 23 agent view) - pure, testable,
// and reused identically by both the filter logic and the calendar page.
// ---------------------------------------------------------------------------

export type ViewingDateBucket = "today" | "tomorrow" | "thisWeek";

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Sunday-start week, matching the app's existing date-range report conventions (no ISO week-start assumption is made elsewhere in this codebase). */
export function dateBucketRange(bucket: ViewingDateBucket, now: Date): { from: Date; to: Date } {
  const today = startOfDay(now);
  if (bucket === "today") {
    return { from: today, to: addDays(today, 1) };
  }
  if (bucket === "tomorrow") {
    return { from: addDays(today, 1), to: addDays(today, 2) };
  }
  const weekStart = addDays(today, -today.getDay());
  return { from: weekStart, to: addDays(weekStart, 7) };
}
