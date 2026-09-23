/**
 * Pure Corporate Housing business rules, deliberately DB-free (same pattern
 * as src/lib/crm/viewing-rules.ts / src/lib/ownership.ts) so contract
 * eligibility, date validation, overlap detection, status transitions, and
 * every dashboard/report metric formula are trivially unit-testable without
 * a database. The actual Prisma queries live in
 * src/lib/actions/corporate-housing/*.ts. See docs/CORPORATE-HOUSING.md.
 */
import type { ContractStatus, CorporateHousingAllocationStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Contract eligibility (Step 10)
// ---------------------------------------------------------------------------

/**
 * Only an ACTIVE Contract may receive a NEW allocation - a DRAFT contract
 * has no lease in force yet, and EXPIRED/TERMINATED/RENEWED no longer
 * represent current occupancy of that Contract's Unit. This is
 * deliberately conservative (existing allocations on a Contract that later
 * expires/is terminated are never retroactively invalidated - see "Contract
 * termination boundary" - only NEW allocation creation is gated here).
 */
export const ELIGIBLE_CONTRACT_STATUSES_FOR_ALLOCATION: readonly ContractStatus[] = ["ACTIVE"];

export function isContractStatusEligibleForAllocation(status: ContractStatus): boolean {
  return ELIGIBLE_CONTRACT_STATUSES_FOR_ALLOCATION.includes(status);
}

export interface ContractEligibilityInput {
  contractOrganizationId: string;
  contractRenterId: string;
  contractStatus: ContractStatus;
  accountOrganizationId: string;
  accountRenterId: string;
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: "ORG_MISMATCH" | "RENTER_MISMATCH" | "STATUS_INELIGIBLE";
}

/**
 * The full Step 10 rule in one place: a Contract may only be referenced by
 * an allocation if it belongs to the Corporate Account's own Renter, is in
 * an eligible status, and every organizationId matches. Never trust a
 * client-supplied contractId/accountId combination - callers re-verify this
 * fresh against the database on every write (see requireCorporateContractEligible()).
 */
export function evaluateContractEligibility(input: ContractEligibilityInput): EligibilityResult {
  if (input.contractOrganizationId !== input.accountOrganizationId) return { eligible: false, reason: "ORG_MISMATCH" };
  if (input.contractRenterId !== input.accountRenterId) return { eligible: false, reason: "RENTER_MISMATCH" };
  if (!isContractStatusEligibleForAllocation(input.contractStatus)) return { eligible: false, reason: "STATUS_INELIGIBLE" };
  return { eligible: true };
}

// ---------------------------------------------------------------------------
// Allocation date validation (Step 11)
// ---------------------------------------------------------------------------

export interface AllocationDateInput {
  contractStartDate: Date;
  contractEndDate: Date;
  startDate: Date;
  plannedEndDate?: Date | null;
}

export interface DateValidationResult {
  valid: boolean;
  reason?: "START_BEFORE_CONTRACT" | "START_AFTER_CONTRACT" | "END_BEFORE_START" | "END_AFTER_CONTRACT";
}

/**
 * An allocation's startDate must fall within [contract.startDate,
 * contract.endDate], and its plannedEndDate (if given) must be on or after
 * startDate and never later than the Contract's own endDate - an occupant
 * can never be "planned" to stay in a Unit past the lease that makes that
 * Unit available in the first place. No business-valid edge case for
 * exceeding the Contract's own dates was found during the architecture
 * audit; if renewal-spanning occupancy becomes a real requirement, it
 * should transfer the occupant onto a new allocation against the renewed
 * Contract (see Step 20), not stretch dates past this Contract's own term.
 */
export function validateAllocationDates(input: AllocationDateInput): DateValidationResult {
  if (input.startDate < input.contractStartDate) return { valid: false, reason: "START_BEFORE_CONTRACT" };
  if (input.startDate > input.contractEndDate) return { valid: false, reason: "START_AFTER_CONTRACT" };
  if (input.plannedEndDate) {
    if (input.plannedEndDate < input.startDate) return { valid: false, reason: "END_BEFORE_START" };
    if (input.plannedEndDate > input.contractEndDate) return { valid: false, reason: "END_AFTER_CONTRACT" };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Overlap detection (Step 13)
// ---------------------------------------------------------------------------

/** Statuses that represent a real, still-live claim on an occupant's time - ENDED/CANCELLED free up the occupant entirely and never block a new allocation. */
export const BLOCKING_ALLOCATION_STATUSES: readonly CorporateHousingAllocationStatus[] = ["PLANNED", "ACTIVE"];

export function isBlockingAllocationStatus(status: CorporateHousingAllocationStatus): boolean {
  return BLOCKING_ALLOCATION_STATUSES.includes(status);
}

/**
 * Two allocation date ranges overlap iff each starts before the other ends.
 * A null end (open-ended - no plannedEndDate/actualEndDate yet) is treated
 * as unbounded ("still ongoing"), matching this codebase's Viewing overlap
 * convention (`hasTimeOverlap()`) of "starts before the other ends, ends
 * after the other starts" - back-to-back allocations (one ends exactly when
 * the next starts) are allowed, not treated as overlapping.
 */
export function allocationDateRangesOverlap(aStart: Date, aEnd: Date | null, bStart: Date, bEnd: Date | null): boolean {
  const aEndMs = aEnd === null ? Infinity : aEnd.getTime();
  const bEndMs = bEnd === null ? Infinity : bEnd.getTime();
  return aStart.getTime() < bEndMs && bStart.getTime() < aEndMs;
}

export interface ExistingOccupantAllocation {
  id: string;
  status: CorporateHousingAllocationStatus;
  startDate: Date;
  plannedEndDate: Date | null;
  actualEndDate: Date | null;
}

/**
 * The centralized overlap check (Step 13): the same occupant may never
 * hold two conflicting PLANNED/ACTIVE allocations (to any Unit - including
 * the same one, which would just be a duplicate) for overlapping dates.
 * ENDED/CANCELLED allocations are never blocking. `excludeAllocationId` lets
 * a transfer/update re-check against the occupant's other allocations
 * without the current record self-conflicting.
 */
export function canOccupantBeAllocated(
  existing: ExistingOccupantAllocation[],
  candidate: { startDate: Date; plannedEndDate: Date | null },
  excludeAllocationId?: string
): boolean {
  for (const allocation of existing) {
    if (allocation.id === excludeAllocationId) continue;
    if (!isBlockingAllocationStatus(allocation.status)) continue;
    const existingEnd = allocation.actualEndDate ?? allocation.plannedEndDate;
    if (allocationDateRangesOverlap(allocation.startDate, existingEnd, candidate.startDate, candidate.plannedEndDate)) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Status transitions (Step 8)
// ---------------------------------------------------------------------------

/**
 * PLANNED may become ACTIVE (arrival day reached) or CANCELLED (never
 * proceeded). ACTIVE may only be ENDED (never CANCELLED - an allocation
 * that has genuinely started is a historical fact, not something to
 * retroactively erase; see Step 19, "cancellation is for allocation
 * records that should not proceed"). ENDED/CANCELLED are terminal - no
 * approval workflow, per the brief's explicit "keep it simple" instruction.
 */
export const ALLOCATION_TRANSITIONS: Record<CorporateHousingAllocationStatus, readonly CorporateHousingAllocationStatus[]> = {
  PLANNED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["ENDED"],
  ENDED: [],
  CANCELLED: [],
};

export function isValidAllocationTransition(from: CorporateHousingAllocationStatus, to: CorporateHousingAllocationStatus): boolean {
  return ALLOCATION_TRANSITIONS[from].includes(to);
}

/** Transfer (Step 20/21) only makes sense from a still-live allocation - the same set as "blocking" (PLANNED or ACTIVE). */
export function canTransferFromStatus(status: CorporateHousingAllocationStatus): boolean {
  return isBlockingAllocationStatus(status);
}

// ---------------------------------------------------------------------------
// Dashboard / report metric formulas (Steps 37-46)
// ---------------------------------------------------------------------------

/**
 * "Unallocated Corporate Unit" (Step 37) is deliberately NOT the same as
 * Unit.status === VACANT: a corporate-leased Unit can be contractually
 * OCCUPIED (an ACTIVE Contract exists) while having zero currently-ACTIVE
 * occupants. This checks only the allocation side - callers combine it
 * with the Unit's own corporate-leased-ness separately.
 */
export function isUnitUnallocated(allocationStatusesForUnit: CorporateHousingAllocationStatus[]): boolean {
  return !allocationStatusesForUnit.some((s) => s === "ACTIVE");
}

export interface AllocationRateInput {
  corporateLeasedUnitCount: number;
  unitsWithActiveAllocationCount: number;
}

/**
 * Allocation rate (Step 46): corporate-leased Units with >= 1 ACTIVE
 * allocation, divided by total corporate-leased Units - never occupant
 * count / unit count (a shared-housing Unit with 3 occupants must not
 * inflate this rate). Rounded to the nearest whole percent, matching
 * computeOccupancySummary()'s own convention (src/lib/owner-portfolio-rules.ts).
 */
export function computeAllocationRate(input: AllocationRateInput): number {
  if (input.corporateLeasedUnitCount <= 0) return 0;
  return Math.round((input.unitsWithActiveAllocationCount / input.corporateLeasedUnitCount) * 100);
}

/** Planned Arrival (Step 40): a PLANNED allocation whose startDate falls within [windowStart, windowEnd], inclusive. */
export function isPlannedArrival(allocation: { status: CorporateHousingAllocationStatus; startDate: Date }, windowStart: Date, windowEnd: Date): boolean {
  return allocation.status === "PLANNED" && allocation.startDate >= windowStart && allocation.startDate <= windowEnd;
}

/** Planned Departure (Step 41): an ACTIVE or PLANNED allocation whose plannedEndDate falls within [windowStart, windowEnd], inclusive - never confused with a Contract Move-Out. */
export function isPlannedDeparture(
  allocation: { status: CorporateHousingAllocationStatus; plannedEndDate: Date | null },
  windowStart: Date,
  windowEnd: Date
): boolean {
  if (!allocation.plannedEndDate) return false;
  if (!isBlockingAllocationStatus(allocation.status)) return false;
  return allocation.plannedEndDate >= windowStart && allocation.plannedEndDate <= windowEnd;
}
