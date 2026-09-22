import { describe, it, expect } from "vitest";
import {
  isValidOfferTransition,
  canEditOfferInPlace,
  canReviseOffer,
  requiresEscalatedApproval,
  canApproveDiscount,
  isExpirable,
  isEffectivelyExpired,
  computeOfferAcceptanceRate,
  leadStatusAfterOfferRejection,
} from "./offer-rules";

describe("isValidOfferTransition", () => {
  it("allows the canonical DRAFT -> PENDING_APPROVAL -> APPROVED -> SENT chain", () => {
    expect(isValidOfferTransition("DRAFT", "PENDING_APPROVAL")).toBe(true);
    expect(isValidOfferTransition("PENDING_APPROVAL", "APPROVED")).toBe(true);
    expect(isValidOfferTransition("APPROVED", "SENT")).toBe(true);
  });

  it("allows PENDING_APPROVAL -> DRAFT (internal approval decline, never REJECTED)", () => {
    expect(isValidOfferTransition("PENDING_APPROVAL", "DRAFT")).toBe(true);
    expect(isValidOfferTransition("PENDING_APPROVAL", "REJECTED")).toBe(false);
  });

  it("allows SENT/UNDER_NEGOTIATION to resolve into ACCEPTED, REJECTED, CANCELLED, or EXPIRED", () => {
    for (const from of ["SENT", "UNDER_NEGOTIATION"] as const) {
      expect(isValidOfferTransition(from, "ACCEPTED")).toBe(true);
      expect(isValidOfferTransition(from, "REJECTED")).toBe(true);
      expect(isValidOfferTransition(from, "CANCELLED")).toBe(true);
      expect(isValidOfferTransition(from, "EXPIRED")).toBe(true);
    }
  });

  it("allows SENT -> UNDER_NEGOTIATION", () => {
    expect(isValidOfferTransition("SENT", "UNDER_NEGOTIATION")).toBe(true);
  });

  it("rejects moves out of every terminal status", () => {
    for (const terminal of ["ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED", "SUPERSEDED"] as const) {
      expect(isValidOfferTransition(terminal, "DRAFT")).toBe(false);
      expect(isValidOfferTransition(terminal, "SENT")).toBe(false);
    }
  });

  it("rejects an invalid skip like COMPLETED-shaped DRAFT -> SENT", () => {
    expect(isValidOfferTransition("DRAFT", "SENT")).toBe(false);
    expect(isValidOfferTransition("DRAFT", "APPROVED")).toBe(false);
  });
});

describe("canEditOfferInPlace / canReviseOffer", () => {
  it("only DRAFT may be edited in place", () => {
    expect(canEditOfferInPlace("DRAFT")).toBe(true);
    expect(canEditOfferInPlace("SENT")).toBe(false);
    expect(canEditOfferInPlace("PENDING_APPROVAL")).toBe(false);
  });

  it("every non-DRAFT, non-ACCEPTED, non-SUPERSEDED status may be revised", () => {
    for (const status of ["PENDING_APPROVAL", "APPROVED", "SENT", "UNDER_NEGOTIATION", "REJECTED", "EXPIRED", "CANCELLED"] as const) {
      expect(canReviseOffer(status)).toBe(true);
    }
  });

  it("DRAFT, ACCEPTED, and SUPERSEDED may never be revised", () => {
    expect(canReviseOffer("DRAFT")).toBe(false);
    expect(canReviseOffer("ACCEPTED")).toBe(false);
    expect(canReviseOffer("SUPERSEDED")).toBe(false);
  });
});

describe("discount approval threshold", () => {
  it("requires escalated approval only above 10%", () => {
    expect(requiresEscalatedApproval(10)).toBe(false);
    expect(requiresEscalatedApproval(10.01)).toBe(true);
    expect(requiresEscalatedApproval(25)).toBe(true);
    expect(requiresEscalatedApproval(0)).toBe(false);
  });

  it("OWNER and ADMIN may always approve, regardless of discount", () => {
    expect(canApproveDiscount("OWNER", 99)).toBe(true);
    expect(canApproveDiscount("ADMIN", 99)).toBe(true);
  });

  it("MANAGER may self-approve at or below 10%, never above", () => {
    expect(canApproveDiscount("MANAGER", 5)).toBe(true);
    expect(canApproveDiscount("MANAGER", 10)).toBe(true);
    expect(canApproveDiscount("MANAGER", 10.5)).toBe(false);
    expect(canApproveDiscount("MANAGER", 30)).toBe(false);
  });

  it("ACCOUNTANT and VIEWER may never approve", () => {
    expect(canApproveDiscount("ACCOUNTANT", 0)).toBe(false);
    expect(canApproveDiscount("VIEWER", 0)).toBe(false);
  });
});

describe("expiry", () => {
  it("only SENT/UNDER_NEGOTIATION/APPROVED are expirable", () => {
    expect(isExpirable("SENT")).toBe(true);
    expect(isExpirable("UNDER_NEGOTIATION")).toBe(true);
    expect(isExpirable("APPROVED")).toBe(true);
    expect(isExpirable("DRAFT")).toBe(false);
    expect(isExpirable("ACCEPTED")).toBe(false);
    expect(isExpirable("REJECTED")).toBe(false);
    expect(isExpirable("CANCELLED")).toBe(false);
    expect(isExpirable("SUPERSEDED")).toBe(false);
    expect(isExpirable("PENDING_APPROVAL")).toBe(false);
  });

  it("is effectively expired once validUntil has passed while in an expirable status", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    expect(isEffectivelyExpired("SENT", new Date("2026-06-14T00:00:00Z"), now)).toBe(true);
    expect(isEffectivelyExpired("SENT", new Date("2026-06-16T00:00:00Z"), now)).toBe(false);
  });

  it("never expires ACCEPTED/REJECTED/CANCELLED/SUPERSEDED even if validUntil has passed", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    const longAgo = new Date("2020-01-01T00:00:00Z");
    for (const status of ["ACCEPTED", "REJECTED", "CANCELLED", "SUPERSEDED"] as const) {
      expect(isEffectivelyExpired(status, longAgo, now)).toBe(false);
    }
  });
});

describe("computeOfferAcceptanceRate", () => {
  it("is ACCEPTED / (ACCEPTED + REJECTED), excluding open offers", () => {
    expect(computeOfferAcceptanceRate(3, 1)).toBe(75);
    expect(computeOfferAcceptanceRate(0, 0)).toBe(0);
    expect(computeOfferAcceptanceRate(0, 5)).toBe(0);
    expect(computeOfferAcceptanceRate(5, 0)).toBe(100);
  });
});

describe("leadStatusAfterOfferRejection", () => {
  it("returns to VIEWING_COMPLETED when the lead has a completed viewing", () => {
    expect(leadStatusAfterOfferRejection(true)).toBe("VIEWING_COMPLETED");
  });

  it("returns to QUALIFIED when the offer came directly from a qualified lead with no completed viewing", () => {
    expect(leadStatusAfterOfferRejection(false)).toBe("QUALIFIED");
  });
});
