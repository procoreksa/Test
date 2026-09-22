import { describe, it, expect } from "vitest";
import { computeContractRentAmount, computeLeaseEndDate, mapOfferToContractInput } from "./reservation-contract-mapping";

describe("computeContractRentAmount", () => {
  it("QUARTERLY: annual rent / 4 - matches the brief's own worked example (80,000 -> 20,000 x 4)", () => {
    expect(computeContractRentAmount(80000, "QUARTERLY", 12)).toBe(20000);
  });

  it("ANNUAL: annual rent / 1 (unchanged)", () => {
    expect(computeContractRentAmount(80000, "ANNUAL", 12)).toBe(80000);
  });

  it("MONTHLY: annual rent / 12, rounded to 2dp", () => {
    expect(computeContractRentAmount(80000, "MONTHLY", 12)).toBe(6666.67);
  });

  it("SEMI_ANNUAL: annual rent / 2", () => {
    expect(computeContractRentAmount(80000, "SEMI_ANNUAL", 12)).toBe(40000);
  });

  it("ONE_TIME with a 12-month term: the full annual amount as a single installment", () => {
    expect(computeContractRentAmount(80000, "ONE_TIME", 12)).toBe(80000);
  });

  it("ONE_TIME with a 24-month term: scaled by lease-term-in-years, not just the annual figure", () => {
    expect(computeContractRentAmount(80000, "ONE_TIME", 24)).toBe(160000);
  });
});

describe("computeLeaseEndDate", () => {
  it("adds the lease duration in months to the start date (reuses date-fns addMonths, no invented convention)", () => {
    expect(computeLeaseEndDate(new Date("2026-10-01T00:00:00Z"), 12)).toEqual(new Date("2027-10-01T00:00:00Z"));
  });

  it("handles a non-12 duration", () => {
    expect(computeLeaseEndDate(new Date("2027-01-01T00:00:00Z"), 6)).toEqual(new Date("2027-07-01T00:00:00Z"));
  });
});

describe("mapOfferToContractInput", () => {
  const baseOffer = {
    netAnnualRent: 80000,
    paymentFrequency: "QUARTERLY" as const,
    securityDeposit: 20000,
    leasingCommissionAmount: 4000,
    leaseDurationMonths: 12,
    specialTerms: "No pets.",
  };

  it("maps every commercial field from the Offer, never from Unit asking rent", () => {
    const result = mapOfferToContractInput(baseOffer, new Date("2026-10-01T00:00:00Z"));
    expect(result.startDate).toEqual(new Date("2026-10-01T00:00:00Z"));
    expect(result.endDate).toEqual(new Date("2027-10-01T00:00:00Z"));
    expect(result.rentAmount).toBe(20000);
    expect(result.paymentFrequency).toBe("QUARTERLY");
    expect(result.securityDeposit).toBe(20000);
    expect(result.commissionAmount).toBe(4000);
    expect(result.extraChargesMode).toBe("ONE_TIME");
    expect(result.notes).toBe("No pets.");
  });

  it("maps a zero security deposit/commission to undefined (matches Contract's own optional-field convention)", () => {
    const result = mapOfferToContractInput({ ...baseOffer, securityDeposit: 0, leasingCommissionAmount: 0 }, new Date("2026-10-01T00:00:00Z"));
    expect(result.securityDeposit).toBeUndefined();
    expect(result.commissionAmount).toBeUndefined();
  });

  it("maps a null specialTerms to undefined notes", () => {
    const result = mapOfferToContractInput({ ...baseOffer, specialTerms: null }, new Date("2026-10-01T00:00:00Z"));
    expect(result.notes).toBeUndefined();
  });
});
