/**
 * Pure Leasing Offer business rules, deliberately DB-free (same pattern as
 * src/lib/crm/viewing-rules.ts) - status-transition legality, the discount
 * approval threshold, revision eligibility, and expiry detection are all
 * pure functions here; the actual Prisma queries live in
 * src/lib/actions/offers.ts.
 */
import type { OfferStatus, UserRole } from "@prisma/client";

// ---------------------------------------------------------------------------
// Status transitions (Step 12) - `status` moves only. `approvalStatus` is a
// deliberately separate field (see docs/LEASING-OFFERS.md, "Approval rules")
// so internal approval decisions never overload the customer-facing status:
// an internally-declined approval sends the offer back to DRAFT (for the
// creator to revise and resubmit), it never sets status to REJECTED -
// REJECTED is reserved exclusively for the customer's own decision.
// ACCEPTED/REJECTED/EXPIRED/CANCELLED/SUPERSEDED are terminal for `status`;
// getting a fresh proposal after any of them requires reviseOffer() to
// create a brand new row (see canReviseOffer below), never a transition on
// the same row.
// ---------------------------------------------------------------------------
const OFFER_TRANSITIONS: Record<OfferStatus, readonly OfferStatus[]> = {
  DRAFT: ["PENDING_APPROVAL", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "DRAFT"],
  APPROVED: ["SENT", "CANCELLED"],
  SENT: ["UNDER_NEGOTIATION", "ACCEPTED", "REJECTED", "CANCELLED", "EXPIRED"],
  UNDER_NEGOTIATION: ["ACCEPTED", "REJECTED", "CANCELLED", "EXPIRED"],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
  SUPERSEDED: [],
};

export function isValidOfferTransition(from: OfferStatus, to: OfferStatus): boolean {
  return OFFER_TRANSITIONS[from]?.includes(to) ?? false;
}

/** DRAFT is the only status a row may be edited in place (Step 11) - every other status requires reviseOffer() to create a new version. */
export function canEditOfferInPlace(status: OfferStatus): boolean {
  return status === "DRAFT";
}

/** Any non-terminal-for-revision status may be revised into a new DRAFT version (Step 11/32) - DRAFT itself is edited in place instead, and ACCEPTED/SUPERSEDED offers never get a new commercial round (accepted moves on to Reservation; superseded already has its successor). */
export function canReviseOffer(status: OfferStatus): boolean {
  return status !== "DRAFT" && status !== "ACCEPTED" && status !== "SUPERSEDED";
}

// ---------------------------------------------------------------------------
// Discount approval threshold (Step 13) - a small, self-contained rule
// deliberately kept out of permissions.ts (which is role-only, with no
// business-data awareness) so it can later migrate into a centralized
// approval engine without an RBAC change. MANAGER holds the offer.approve
// permission itself (see src/lib/permissions.ts); this function is the
// second, data-aware gate every approveOffer() call must also pass.
// ---------------------------------------------------------------------------
const DISCOUNT_APPROVAL_THRESHOLD_PERCENT = 10;

export function requiresEscalatedApproval(discountPercentage: number): boolean {
  return discountPercentage > DISCOUNT_APPROVAL_THRESHOLD_PERCENT;
}

/** OWNER/ADMIN may always approve. MANAGER may only self-approve discounts at or below the threshold - see docs/LEASING-OFFERS.md, "Approval rules". */
export function canApproveDiscount(role: UserRole, discountPercentage: number): boolean {
  if (role === "OWNER" || role === "ADMIN") return true;
  if (role === "MANAGER") return !requiresEscalatedApproval(discountPercentage);
  return false;
}

// ---------------------------------------------------------------------------
// Expiry (Step 26) - derived, never requires a cron job. An offer is
// "effectively expired" the instant validUntil passes while it's still in
// one of these three statuses; syncExpiredOffers() in offers.ts persists
// this lazily on every list/detail read (a plain, idempotent UPDATE ...
// WHERE, not an individually audited user action - see docs/
// LEASING-OFFERS.md, "Expiry").
// ---------------------------------------------------------------------------
const EXPIRABLE_STATUSES: readonly OfferStatus[] = ["SENT", "UNDER_NEGOTIATION", "APPROVED"];

export function isExpirable(status: OfferStatus): boolean {
  return EXPIRABLE_STATUSES.includes(status);
}

export function isEffectivelyExpired(status: OfferStatus, validUntil: Date, now: Date): boolean {
  return isExpirable(status) && validUntil < now;
}

// ---------------------------------------------------------------------------
// Metrics (Step 29/30) - see docs/LEASING-OFFERS.md, "Metrics", for the
// authoritative formulas. Matches computeViewingCompletionRate()'s
// convention: 0 (never NaN) when the denominator is 0.
// ---------------------------------------------------------------------------
function ratePercent(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/** ACCEPTED / (ACCEPTED + REJECTED) - Draft/Pending/open offers are deliberately excluded from both sides (Step 30). */
export function computeOfferAcceptanceRate(accepted: number, rejected: number): number {
  return ratePercent(accepted, accepted + rejected);
}

/**
 * Deterministic Lead-status reversion target on customer rejection (Step
 * 18): "do NOT automatically mark Lead LOST... return Lead to QUALIFIED or
 * VIEWING_COMPLETED depending on previous state / available history."
 * There is no stored Lead-status-history table (see src/lib/actions/
 * leads.ts), so this is derived from one observable fact: does the Lead
 * have at least one COMPLETED Viewing at all? If so it returns to
 * VIEWING_COMPLETED (a viewing did happen), otherwise QUALIFIED (the offer
 * was made directly from a qualified Lead, per Step 10).
 */
export function leadStatusAfterOfferRejection(hasCompletedViewing: boolean): "VIEWING_COMPLETED" | "QUALIFIED" {
  return hasCompletedViewing ? "VIEWING_COMPLETED" : "QUALIFIED";
}
