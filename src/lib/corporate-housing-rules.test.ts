import { describe, it, expect } from "vitest";
import {
  isContractStatusEligibleForAllocation,
  evaluateContractEligibility,
  validateAllocationDates,
  allocationDateRangesOverlap,
  canOccupantBeAllocated,
  isValidAllocationTransition,
  canTransferFromStatus,
  isUnitUnallocated,
  computeAllocationRate,
  isPlannedArrival,
  isPlannedDeparture,
} from "./corporate-housing-rules";

describe("isContractStatusEligibleForAllocation", () => {
  it("only ACTIVE is eligible", () => {
    expect(isContractStatusEligibleForAllocation("ACTIVE")).toBe(true);
    expect(isContractStatusEligibleForAllocation("DRAFT")).toBe(false);
    expect(isContractStatusEligibleForAllocation("EXPIRED")).toBe(false);
    expect(isContractStatusEligibleForAllocation("TERMINATED")).toBe(false);
    expect(isContractStatusEligibleForAllocation("RENEWED")).toBe(false);
  });
});

describe("evaluateContractEligibility", () => {
  const base = { contractOrganizationId: "org1", contractRenterId: "renter1", contractStatus: "ACTIVE" as const, accountOrganizationId: "org1", accountRenterId: "renter1" };

  it("eligible when org and renter match and status is ACTIVE", () => {
    expect(evaluateContractEligibility(base)).toEqual({ eligible: true });
  });

  it("rejects a cross-org contract even if renterId happens to match", () => {
    expect(evaluateContractEligibility({ ...base, contractOrganizationId: "org2" })).toEqual({ eligible: false, reason: "ORG_MISMATCH" });
  });

  it("rejects a contract belonging to a different renter (same-org relation injection)", () => {
    expect(evaluateContractEligibility({ ...base, contractRenterId: "renter2" })).toEqual({ eligible: false, reason: "RENTER_MISMATCH" });
  });

  it("rejects a non-ACTIVE contract", () => {
    expect(evaluateContractEligibility({ ...base, contractStatus: "TERMINATED" })).toEqual({ eligible: false, reason: "STATUS_INELIGIBLE" });
  });
});

describe("validateAllocationDates", () => {
  const contractStartDate = new Date("2026-01-01");
  const contractEndDate = new Date("2026-12-31");

  it("valid when startDate is within contract range and no plannedEndDate", () => {
    expect(validateAllocationDates({ contractStartDate, contractEndDate, startDate: new Date("2026-06-01") })).toEqual({ valid: true });
  });

  it("rejects a startDate before the contract starts", () => {
    expect(validateAllocationDates({ contractStartDate, contractEndDate, startDate: new Date("2025-12-01") })).toEqual({ valid: false, reason: "START_BEFORE_CONTRACT" });
  });

  it("rejects a startDate after the contract ends", () => {
    expect(validateAllocationDates({ contractStartDate, contractEndDate, startDate: new Date("2027-01-01") })).toEqual({ valid: false, reason: "START_AFTER_CONTRACT" });
  });

  it("rejects a plannedEndDate before startDate", () => {
    expect(validateAllocationDates({ contractStartDate, contractEndDate, startDate: new Date("2026-06-01"), plannedEndDate: new Date("2026-05-01") })).toEqual({
      valid: false,
      reason: "END_BEFORE_START",
    });
  });

  it("rejects a plannedEndDate past the contract's own end", () => {
    expect(validateAllocationDates({ contractStartDate, contractEndDate, startDate: new Date("2026-06-01"), plannedEndDate: new Date("2027-06-01") })).toEqual({
      valid: false,
      reason: "END_AFTER_CONTRACT",
    });
  });

  it("valid when plannedEndDate is within range", () => {
    expect(validateAllocationDates({ contractStartDate, contractEndDate, startDate: new Date("2026-06-01"), plannedEndDate: new Date("2026-09-01") })).toEqual({ valid: true });
  });
});

describe("allocationDateRangesOverlap", () => {
  it("overlapping ranges return true", () => {
    expect(allocationDateRangesOverlap(new Date("2026-01-01"), new Date("2026-06-01"), new Date("2026-03-01"), new Date("2026-09-01"))).toBe(true);
  });

  it("back-to-back ranges (one ends exactly when the other starts) do not overlap", () => {
    expect(allocationDateRangesOverlap(new Date("2026-01-01"), new Date("2026-06-01"), new Date("2026-06-01"), new Date("2026-09-01"))).toBe(false);
  });

  it("a null end (open-ended/ongoing) is treated as unbounded", () => {
    expect(allocationDateRangesOverlap(new Date("2026-01-01"), null, new Date("2027-01-01"), new Date("2027-06-01"))).toBe(true);
  });

  it("non-overlapping ranges return false", () => {
    expect(allocationDateRangesOverlap(new Date("2026-01-01"), new Date("2026-03-01"), new Date("2026-06-01"), new Date("2026-09-01"))).toBe(false);
  });
});

describe("canOccupantBeAllocated", () => {
  const existing = [{ id: "a1", status: "ACTIVE" as const, startDate: new Date("2026-01-01"), plannedEndDate: new Date("2026-06-01"), actualEndDate: null }];

  it("blocks an overlapping candidate against an ACTIVE allocation", () => {
    expect(canOccupantBeAllocated(existing, { startDate: new Date("2026-03-01"), plannedEndDate: new Date("2026-09-01") })).toBe(false);
  });

  it("allows a non-overlapping candidate", () => {
    expect(canOccupantBeAllocated(existing, { startDate: new Date("2026-07-01"), plannedEndDate: new Date("2026-09-01") })).toBe(true);
  });

  it("ignores CANCELLED/ENDED allocations", () => {
    const cancelled = [{ ...existing[0], status: "CANCELLED" as const }];
    expect(canOccupantBeAllocated(cancelled, { startDate: new Date("2026-03-01"), plannedEndDate: new Date("2026-09-01") })).toBe(true);
  });

  it("excludes the allocation being updated via excludeAllocationId", () => {
    expect(canOccupantBeAllocated(existing, { startDate: new Date("2026-01-01"), plannedEndDate: new Date("2026-06-01") }, "a1")).toBe(true);
  });
});

describe("isValidAllocationTransition / canTransferFromStatus", () => {
  it("PLANNED can become ACTIVE or CANCELLED only", () => {
    expect(isValidAllocationTransition("PLANNED", "ACTIVE")).toBe(true);
    expect(isValidAllocationTransition("PLANNED", "CANCELLED")).toBe(true);
    expect(isValidAllocationTransition("PLANNED", "ENDED")).toBe(false);
  });

  it("ACTIVE can only become ENDED - never CANCELLED", () => {
    expect(isValidAllocationTransition("ACTIVE", "ENDED")).toBe(true);
    expect(isValidAllocationTransition("ACTIVE", "CANCELLED")).toBe(false);
  });

  it("ENDED and CANCELLED are terminal", () => {
    expect(isValidAllocationTransition("ENDED", "ACTIVE")).toBe(false);
    expect(isValidAllocationTransition("CANCELLED", "ACTIVE")).toBe(false);
  });

  it("transfer is only valid from PLANNED or ACTIVE", () => {
    expect(canTransferFromStatus("PLANNED")).toBe(true);
    expect(canTransferFromStatus("ACTIVE")).toBe(true);
    expect(canTransferFromStatus("ENDED")).toBe(false);
    expect(canTransferFromStatus("CANCELLED")).toBe(false);
  });
});

describe("isUnitUnallocated", () => {
  it("a unit with an ACTIVE allocation is not unallocated", () => {
    expect(isUnitUnallocated(["ACTIVE"])).toBe(false);
  });

  it("a unit with only PLANNED/ENDED/CANCELLED allocations is unallocated", () => {
    expect(isUnitUnallocated(["PLANNED", "ENDED", "CANCELLED"])).toBe(true);
  });

  it("a unit with no allocations at all is unallocated", () => {
    expect(isUnitUnallocated([])).toBe(true);
  });
});

describe("computeAllocationRate", () => {
  it("computes the percentage of corporate-leased units with an active allocation", () => {
    expect(computeAllocationRate({ corporateLeasedUnitCount: 4, unitsWithActiveAllocationCount: 2 })).toBe(50);
  });

  it("rounds to the nearest whole percent", () => {
    expect(computeAllocationRate({ corporateLeasedUnitCount: 3, unitsWithActiveAllocationCount: 2 })).toBe(67);
  });

  it("returns zero (never NaN) when there are no corporate-leased units", () => {
    expect(computeAllocationRate({ corporateLeasedUnitCount: 0, unitsWithActiveAllocationCount: 0 })).toBe(0);
  });

  it("is never occupant-count-based - two active allocations on one unit still counts that unit once", () => {
    // Caller is responsible for passing unit-level counts, not allocation counts - this
    // test documents that the formula itself has no occupant-count concept at all.
    expect(computeAllocationRate({ corporateLeasedUnitCount: 1, unitsWithActiveAllocationCount: 1 })).toBe(100);
  });
});

describe("isPlannedArrival", () => {
  const windowStart = new Date("2026-01-01");
  const windowEnd = new Date("2026-01-31");

  it("a PLANNED allocation starting within the window is an arrival", () => {
    expect(isPlannedArrival({ status: "PLANNED", startDate: new Date("2026-01-15") }, windowStart, windowEnd)).toBe(true);
  });

  it("an ACTIVE allocation is never an arrival, even if its start date is in the window", () => {
    expect(isPlannedArrival({ status: "ACTIVE", startDate: new Date("2026-01-15") }, windowStart, windowEnd)).toBe(false);
  });

  it("a PLANNED allocation starting outside the window is not an arrival", () => {
    expect(isPlannedArrival({ status: "PLANNED", startDate: new Date("2026-03-01") }, windowStart, windowEnd)).toBe(false);
  });
});

describe("isPlannedDeparture", () => {
  const windowStart = new Date("2026-06-01");
  const windowEnd = new Date("2026-06-30");

  it("an ACTIVE allocation with plannedEndDate in the window is a departure", () => {
    expect(isPlannedDeparture({ status: "ACTIVE", plannedEndDate: new Date("2026-06-15") }, windowStart, windowEnd)).toBe(true);
  });

  it("a PLANNED allocation with plannedEndDate in the window is also a departure", () => {
    expect(isPlannedDeparture({ status: "PLANNED", plannedEndDate: new Date("2026-06-15") }, windowStart, windowEnd)).toBe(true);
  });

  it("an allocation with no plannedEndDate is never a departure", () => {
    expect(isPlannedDeparture({ status: "ACTIVE", plannedEndDate: null }, windowStart, windowEnd)).toBe(false);
  });

  it("an ENDED/CANCELLED allocation is never a departure, even with a matching plannedEndDate", () => {
    expect(isPlannedDeparture({ status: "ENDED", plannedEndDate: new Date("2026-06-15") }, windowStart, windowEnd)).toBe(false);
  });

  it("this is never confused with a Contract Move-Out - it is purely allocation-date-based", () => {
    expect(isPlannedDeparture({ status: "ACTIVE", plannedEndDate: new Date("2026-07-15") }, windowStart, windowEnd)).toBe(false);
  });
});
