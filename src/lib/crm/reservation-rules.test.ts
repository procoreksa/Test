import { describe, it, expect } from "vitest";
import {
  DEFAULT_HOLD_HOURS,
  defaultHoldUntil,
  isValidReservationTransition,
  BLOCKING_UNIT_RESERVATION_STATUSES,
  isBlockingUnitReservationStatus,
  blocksNewReservationForOffer,
  isExpirableReservationStatus,
  isEffectivelyExpiredReservation,
  defaultReservationAmountStatus,
  computeReservationConfirmationRate,
} from "./reservation-rules";

describe("defaultHoldUntil", () => {
  it("defaults to 48 hours from the given time", () => {
    expect(DEFAULT_HOLD_HOURS).toBe(48);
    const from = new Date("2027-01-01T00:00:00Z");
    const result = defaultHoldUntil(from);
    expect(result.toISOString()).toBe("2027-01-03T00:00:00.000Z");
  });
});

describe("isValidReservationTransition", () => {
  it("allows the canonical DRAFT -> PENDING -> CONFIRMED chain", () => {
    expect(isValidReservationTransition("DRAFT", "PENDING")).toBe(true);
    expect(isValidReservationTransition("PENDING", "CONFIRMED")).toBe(true);
  });

  it("allows PENDING/CONFIRMED to resolve into CANCELLED or EXPIRED", () => {
    for (const from of ["PENDING", "CONFIRMED"] as const) {
      expect(isValidReservationTransition(from, "CANCELLED")).toBe(true);
      expect(isValidReservationTransition(from, "EXPIRED")).toBe(true);
    }
  });

  it("allows CONFIRMED -> RELEASED but not PENDING -> RELEASED", () => {
    expect(isValidReservationTransition("CONFIRMED", "RELEASED")).toBe(true);
    expect(isValidReservationTransition("PENDING", "RELEASED")).toBe(false);
  });

  it("never allows any action to set CONVERTED_TO_CONTRACT (reserved for the future Contract module)", () => {
    for (const from of ["DRAFT", "PENDING", "CONFIRMED", "EXPIRED", "CANCELLED", "RELEASED", "CONVERTED_TO_CONTRACT"] as const) {
      expect(isValidReservationTransition(from, "CONVERTED_TO_CONTRACT")).toBe(false);
    }
  });

  it("rejects moves out of every terminal status", () => {
    for (const terminal of ["EXPIRED", "CANCELLED", "RELEASED", "CONVERTED_TO_CONTRACT"] as const) {
      expect(isValidReservationTransition(terminal, "PENDING")).toBe(false);
      expect(isValidReservationTransition(terminal, "CONFIRMED")).toBe(false);
    }
  });

  it("rejects an invalid skip like DRAFT -> CONFIRMED", () => {
    expect(isValidReservationTransition("DRAFT", "CONFIRMED")).toBe(false);
  });
});

describe("Unit-level blocking statuses", () => {
  it("only PENDING and CONFIRMED block", () => {
    expect(BLOCKING_UNIT_RESERVATION_STATUSES).toEqual(["PENDING", "CONFIRMED"]);
    expect(isBlockingUnitReservationStatus("PENDING")).toBe(true);
    expect(isBlockingUnitReservationStatus("CONFIRMED")).toBe(true);
  });

  it("DRAFT and every terminal status do not block", () => {
    for (const status of ["DRAFT", "EXPIRED", "CANCELLED", "RELEASED", "CONVERTED_TO_CONTRACT"] as const) {
      expect(isBlockingUnitReservationStatus(status)).toBe(false);
    }
  });
});

describe("blocksNewReservationForOffer (one active reservation per Offer)", () => {
  it("DRAFT, PENDING, CONFIRMED, and CONVERTED_TO_CONTRACT all block a new one", () => {
    for (const status of ["DRAFT", "PENDING", "CONFIRMED", "CONVERTED_TO_CONTRACT"] as const) {
      expect(blocksNewReservationForOffer(status)).toBe(true);
    }
  });

  it("EXPIRED, CANCELLED, and RELEASED free the Offer for a new reservation", () => {
    for (const status of ["EXPIRED", "CANCELLED", "RELEASED"] as const) {
      expect(blocksNewReservationForOffer(status)).toBe(false);
    }
  });
});

describe("expiry", () => {
  it("only PENDING/CONFIRMED are expirable", () => {
    expect(isExpirableReservationStatus("PENDING")).toBe(true);
    expect(isExpirableReservationStatus("CONFIRMED")).toBe(true);
    for (const status of ["DRAFT", "EXPIRED", "CANCELLED", "RELEASED", "CONVERTED_TO_CONTRACT"] as const) {
      expect(isExpirableReservationStatus(status)).toBe(false);
    }
  });

  it("is effectively expired once holdUntil has passed while in an expirable status", () => {
    const now = new Date("2027-01-05T00:00:00Z");
    expect(isEffectivelyExpiredReservation("PENDING", new Date("2027-01-04T00:00:00Z"), now)).toBe(true);
    expect(isEffectivelyExpiredReservation("PENDING", new Date("2027-01-06T00:00:00Z"), now)).toBe(false);
  });

  it("never expires DRAFT/CANCELLED/RELEASED/CONVERTED_TO_CONTRACT even if holdUntil has passed", () => {
    const now = new Date("2027-01-05T00:00:00Z");
    const longAgo = new Date("2020-01-01T00:00:00Z");
    for (const status of ["DRAFT", "CANCELLED", "RELEASED", "CONVERTED_TO_CONTRACT"] as const) {
      expect(isEffectivelyExpiredReservation(status, longAgo, now)).toBe(false);
    }
  });
});

describe("defaultReservationAmountStatus", () => {
  it("is NOT_REQUIRED for a zero amount, PENDING for anything positive", () => {
    expect(defaultReservationAmountStatus(0)).toBe("NOT_REQUIRED");
    expect(defaultReservationAmountStatus(5000)).toBe("PENDING");
  });
});

describe("computeReservationConfirmationRate", () => {
  it("is CONFIRMED / (CONFIRMED + CANCELLED + EXPIRED)", () => {
    expect(computeReservationConfirmationRate(3, 1, 0)).toBe(75);
    expect(computeReservationConfirmationRate(0, 0, 0)).toBe(0);
    expect(computeReservationConfirmationRate(0, 2, 3)).toBe(0);
    expect(computeReservationConfirmationRate(5, 0, 0)).toBe(100);
  });
});
