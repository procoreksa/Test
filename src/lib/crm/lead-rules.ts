/**
 * Pure CRM business rules, deliberately kept DB-free (see
 * src/lib/ownership.ts for the same pattern in the ownership module) so
 * they're trivially unit-testable and the actual Prisma queries in
 * src/lib/actions/leads.ts stay thin wrappers around these decisions.
 */
import { normalizeSaudiMobile } from "@/lib/crm/phone";

/**
 * Conversion rate = WON / (WON + LOST). Active (not yet closed) leads are
 * NEVER part of the denominator - see docs/CRM-LEADS.md, "Conversion rate
 * calculation". Returns 0 when there are no closed leads yet (rather than
 * NaN), since "0% of nothing" is a more useful default for a dashboard
 * than a NaN that needs special-casing everywhere it's displayed.
 */
export function computeConversionRate(wonCount: number, lostCount: number): number {
  const closed = wonCount + lostCount;
  if (closed === 0) return 0;
  return Math.round((wonCount / closed) * 1000) / 10; // one decimal place, e.g. 33.3
}

export interface DuplicateCandidate {
  id: string;
  leadNumber: string;
  fullName: string;
  mobile: string;
  normalizedMobile: string;
  email: string | null;
  status: string;
  assignedToUserId: string | null;
}

export interface DuplicateMatch extends DuplicateCandidate {
  matchedOn: "mobile" | "email";
}

/**
 * Finds existing leads that look like the same prospect as the one being
 * entered, by exact normalized-mobile or case-insensitive email match.
 * Pure function over an already-fetched candidate list (the DB query
 * itself lives in src/lib/actions/leads.ts) so it's unit-testable without
 * a database. Never throws/blocks - callers decide whether to warn or
 * allow through, per the brief's "do not silently block legitimate
 * duplicates."
 */
export function findDuplicateMatches(
  candidates: DuplicateCandidate[],
  input: { mobile: string; email?: string | null }
): DuplicateMatch[] {
  const normalizedInputMobile = normalizeSaudiMobile(input.mobile);
  const normalizedInputEmail = input.email?.trim().toLowerCase() || null;

  return candidates
    .map((c): DuplicateMatch | null => {
      if (normalizedInputMobile && c.normalizedMobile === normalizedInputMobile) {
        return { ...c, matchedOn: "mobile" };
      }
      if (normalizedInputEmail && c.email && c.email.trim().toLowerCase() === normalizedInputEmail) {
        return { ...c, matchedOn: "email" };
      }
      return null;
    })
    .filter((m): m is DuplicateMatch => m !== null);
}

/** OTHER requires a non-empty note; every other LeadLostReason value does not need one. */
export function validateLostReason(reason: string, note: string | null | undefined): string | null {
  if (reason === "OTHER" && !note?.trim()) {
    return "lostReasonNoteRequired";
  }
  return null;
}

const ACTIVE_STATUSES = new Set(["NEW", "CONTACTED", "QUALIFIED", "VIEWING_PENDING", "VIEWING_COMPLETED", "OFFER_PENDING", "NEGOTIATION", "RESERVATION_PENDING"]);

/** WON/LOST/ARCHIVED are closed states; everything else is an active pipeline stage that can still show up in a follow-up worklist. */
export function isActiveLeadStatus(status: string): boolean {
  return ACTIVE_STATUSES.has(status);
}

export type FollowUpBucket = "overdue" | "today" | "upcoming";

/** Buckets a lead's nextFollowUpAt relative to `now`, or null if the lead has none set or is already closed (closed leads never show up in follow-up worklists). */
export function followUpBucket(status: string, nextFollowUpAt: Date | null, now: Date): FollowUpBucket | null {
  if (!nextFollowUpAt || !isActiveLeadStatus(status)) return null;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  if (nextFollowUpAt < startOfToday) return "overdue";
  if (nextFollowUpAt < startOfTomorrow) return "today";
  return "upcoming";
}

/** "first last" for individual/agent-referral leads, companyName for corporate leads - the single display name stored on Lead.fullName. */
export function buildLeadFullName(input: {
  leadType: string;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
}): string {
  if (input.leadType === "CORPORATE" && input.companyName?.trim()) {
    return input.companyName.trim();
  }
  return [input.firstName?.trim(), input.lastName?.trim()].filter(Boolean).join(" ") || input.companyName?.trim() || "";
}
