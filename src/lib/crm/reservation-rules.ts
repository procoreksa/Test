/**
 * Pure Reservation business rules, deliberately DB-free (same pattern as
 * src/lib/crm/viewing-rules.ts and src/lib/crm/offer-rules.ts) - status-
 * transition legality, hold-period defaults, conflict/expiry detection, and
 * metric formulas are all pure functions here; the actual Prisma queries
 * live in src/lib/actions/reservations.ts.
 */
import type { ReservationStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Hold period (Step 9) - centralized so no call site hardcodes "48 hours".
// ---------------------------------------------------------------------------
export const DEFAULT_HOLD_HOURS = 48;

export function defaultHoldUntil(from: Date = new Date()): Date {
  return new Date(from.getTime() + DEFAULT_HOLD_HOURS * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Status transitions (Step 12) - the single source of truth for which moves
// are legal, checked server-side before every mutating action writes
// anything. CONFIRMED -> CONVERTED_TO_CONTRACT is set only by
// convertReservationToContract() (see docs/RESERVATION-TO-CONTRACT.md) -
// every other module treats CONVERTED_TO_CONTRACT as terminal, same as
// EXPIRED/CANCELLED/RELEASED.
// ---------------------------------------------------------------------------
const RESERVATION_TRANSITIONS: Record<ReservationStatus, readonly ReservationStatus[]> = {
  DRAFT: ["PENDING", "CANCELLED"],
  PENDING: ["CONFIRMED", "CANCELLED", "EXPIRED"],
  CONFIRMED: ["CANCELLED", "EXPIRED", "RELEASED", "CONVERTED_TO_CONTRACT"],
  EXPIRED: [],
  CANCELLED: [],
  RELEASED: [],
  CONVERTED_TO_CONTRACT: [],
};

export function isValidReservationTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return RESERVATION_TRANSITIONS[from]?.includes(to) ?? false;
}

/** PENDING/CONFIRMED are the only statuses a Unit-level conflict check blocks on (Step 8) - DRAFT is explicitly non-blocking per the brief, and every terminal status has already freed its slot. */
export const BLOCKING_UNIT_RESERVATION_STATUSES: readonly ReservationStatus[] = ["PENDING", "CONFIRMED"];

export function isBlockingUnitReservationStatus(status: ReservationStatus): boolean {
  return BLOCKING_UNIT_RESERVATION_STATUSES.includes(status);
}

/**
 * One-active-reservation-per-Offer rule (Step 6): a second reservation for
 * the same Offer is blocked unless every existing one for that Offer has
 * already reached EXPIRED/CANCELLED/RELEASED. Deliberately stricter than
 * the Unit-level conflict check above - DRAFT and CONVERTED_TO_CONTRACT
 * both still block a second reservation here (an Offer that already
 * converted to a Contract, or that already has an unsent Draft
 * reservation, should not silently grow a second one).
 */
export function blocksNewReservationForOffer(status: ReservationStatus): boolean {
  return status !== "EXPIRED" && status !== "CANCELLED" && status !== "RELEASED";
}

// ---------------------------------------------------------------------------
// Expiry (Step 10/32) - derived, never requires a cron job for correctness.
// ---------------------------------------------------------------------------
const EXPIRABLE_STATUSES: readonly ReservationStatus[] = ["PENDING", "CONFIRMED"];

export function isExpirableReservationStatus(status: ReservationStatus): boolean {
  return EXPIRABLE_STATUSES.includes(status);
}

export function isEffectivelyExpiredReservation(status: ReservationStatus, holdUntil: Date, now: Date): boolean {
  return isExpirableReservationStatus(status) && holdUntil < now;
}

// ---------------------------------------------------------------------------
// Reservation amount (Step 11) - status only ever set automatically at
// creation time; every later move is a manual, authorized action.
// ---------------------------------------------------------------------------
export function defaultReservationAmountStatus(amount: number): "NOT_REQUIRED" | "PENDING" {
  return amount > 0 ? "PENDING" : "NOT_REQUIRED";
}

// ---------------------------------------------------------------------------
// Metrics (Step 27) - matches computeViewingCompletionRate()'s/
// computeOfferAcceptanceRate()'s convention: 0 (never NaN) when the
// denominator is 0.
// ---------------------------------------------------------------------------
function ratePercent(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** CONFIRMED / (CONFIRMED + CANCELLED + EXPIRED) - reservations still DRAFT/PENDING haven't reached an end state yet and are excluded from the denominator, same convention as computeViewingCompletionRate(). */
export function computeReservationConfirmationRate(confirmed: number, cancelled: number, expired: number): number {
  return ratePercent(confirmed, confirmed + cancelled + expired);
}

/**
 * Reservation-to-Contract Conversion Rate (Step 34 of
 * docs/RESERVATION-TO-CONTRACT.md): CONVERTED_TO_CONTRACT / (CONVERTED_TO_CONTRACT
 * + CANCELLED + EXPIRED + RELEASED). Still-active reservations
 * (DRAFT/PENDING/CONFIRMED) are deliberately excluded from both sides -
 * they haven't reached an end state yet, same convention as every other
 * rate in this file.
 */
export function computeReservationToContractConversionRate(converted: number, cancelled: number, expired: number, released: number): number {
  return ratePercent(converted, converted + cancelled + expired + released);
}
