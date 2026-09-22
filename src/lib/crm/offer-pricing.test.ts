import { describe, it, expect } from "vitest";
import { computeOfferPricing, installmentCountForFrequency, defaultSecurityDeposit } from "./offer-pricing";

describe("installmentCountForFrequency", () => {
  it("maps every PaymentFrequency to its installment count", () => {
    expect(installmentCountForFrequency("MONTHLY")).toBe(12);
    expect(installmentCountForFrequency("QUARTERLY")).toBe(4);
    expect(installmentCountForFrequency("SEMI_ANNUAL")).toBe(2);
    expect(installmentCountForFrequency("ANNUAL")).toBe(1);
    expect(installmentCountForFrequency("ONE_TIME")).toBe(1);
  });
});

describe("computeOfferPricing", () => {
  it("computes with no discount and no commission", () => {
    const result = computeOfferPricing({ annualRent: 80000, securityDeposit: 20000, paymentFrequency: "QUARTERLY" });
    expect(result.grossAnnualRent).toBe(80000);
    expect(result.discountAmount).toBe(0);
    expect(result.discountPercentage).toBe(0);
    expect(result.netAnnualRent).toBe(80000);
    expect(result.leasingCommissionAmount).toBe(0);
    expect(result.commissionVatAmount).toBe(0);
    expect(result.installmentCount).toBe(4);
    expect(result.installmentAmount).toBe(20000);
    expect(result.initialPaymentTotal).toBe(20000 + 20000);
  });

  it("applies a discountPercentage input and derives the equivalent discountAmount", () => {
    const result = computeOfferPricing({ annualRent: 100000, discountPercentage: 10, securityDeposit: 0, paymentFrequency: "ANNUAL" });
    expect(result.discountAmount).toBe(10000);
    expect(result.discountPercentage).toBe(10);
    expect(result.netAnnualRent).toBe(90000);
  });

  it("applies a discountAmount input and derives the equivalent discountPercentage", () => {
    const result = computeOfferPricing({ annualRent: 100000, discountAmount: 15000, securityDeposit: 0, paymentFrequency: "ANNUAL" });
    expect(result.discountAmount).toBe(15000);
    expect(result.discountPercentage).toBe(15);
    expect(result.netAnnualRent).toBe(85000);
  });

  it("discountAmount wins when both discount inputs are supplied", () => {
    const result = computeOfferPricing({ annualRent: 100000, discountAmount: 5000, discountPercentage: 50, securityDeposit: 0, paymentFrequency: "ANNUAL" });
    expect(result.discountAmount).toBe(5000);
    expect(result.discountPercentage).toBe(5);
  });

  it("clamps discount to never exceed the gross annual rent", () => {
    const result = computeOfferPricing({ annualRent: 10000, discountAmount: 50000, securityDeposit: 0, paymentFrequency: "ANNUAL" });
    expect(result.discountAmount).toBe(10000);
    expect(result.netAnnualRent).toBe(0);
  });

  it("computes commission from a flat commissionAmount, taxed at commissionVatRate", () => {
    const result = computeOfferPricing({ annualRent: 80000, commissionAmount: 4000, commissionVatRate: 15, securityDeposit: 0, paymentFrequency: "ANNUAL" });
    expect(result.leasingCommissionAmount).toBe(4000);
    expect(result.commissionVatAmount).toBe(600);
    expect(result.totalCommissionWithVat).toBe(4600);
  });

  it("computes commission from a commissionRate percentage of the NET annual rent", () => {
    const result = computeOfferPricing({ annualRent: 100000, discountAmount: 20000, commissionRate: 5, securityDeposit: 0, paymentFrequency: "ANNUAL" });
    // netAnnualRent = 80000, commission = 5% of 80000 = 4000
    expect(result.leasingCommissionAmount).toBe(4000);
    expect(result.commissionVatAmount).toBe(600);
  });

  it("defaults commissionVatRate to STANDARD_VAT_RATE (15) when not supplied", () => {
    const result = computeOfferPricing({ annualRent: 80000, commissionAmount: 1000, securityDeposit: 0, paymentFrequency: "ANNUAL" });
    expect(result.commissionVatRate).toBe(15);
    expect(result.commissionVatAmount).toBe(150);
  });

  it("never applies VAT to rent, security deposit, or contract fee", () => {
    const result = computeOfferPricing({ annualRent: 100000, securityDeposit: 10000, contractFee: 500, paymentFrequency: "ANNUAL" });
    // No vat-bearing field exists for rent/deposit/fee at all - this test
    // simply asserts the total composition never implicitly taxes them.
    expect(result.initialPaymentTotal).toBe(result.installmentAmount + result.securityDeposit + result.contractFee + result.totalCommissionWithVat);
  });

  it("computes indicative quarterly installments for a round net rent", () => {
    const result = computeOfferPricing({ annualRent: 80000, securityDeposit: 0, paymentFrequency: "QUARTERLY" });
    expect(result.installmentAmount).toBe(20000);
    expect(result.installmentCount).toBe(4);
  });

  it("computes initialPaymentTotal as first installment + deposit + fee + commission-with-VAT", () => {
    const result = computeOfferPricing({
      annualRent: 120000,
      discountPercentage: 5,
      commissionRate: 5,
      securityDeposit: 10000,
      contractFee: 500,
      paymentFrequency: "MONTHLY",
    });
    const expectedInitial = result.installmentAmount + result.securityDeposit + result.contractFee + result.totalCommissionWithVat;
    expect(result.initialPaymentTotal).toBe(expectedInitial);
  });

  it("clamps a negative annualRent/discount/securityDeposit/contractFee to zero", () => {
    const result = computeOfferPricing({ annualRent: -5000, discountAmount: -100, securityDeposit: -200, contractFee: -50, paymentFrequency: "ANNUAL" });
    expect(result.grossAnnualRent).toBe(0);
    expect(result.discountAmount).toBe(0);
    expect(result.securityDeposit).toBe(0);
    expect(result.contractFee).toBe(0);
  });
});

describe("defaultSecurityDeposit", () => {
  it("defaults to one installment's worth of the net annual rent", () => {
    expect(defaultSecurityDeposit(80000, "QUARTERLY")).toBe(20000);
    expect(defaultSecurityDeposit(120000, "MONTHLY")).toBe(10000);
    expect(defaultSecurityDeposit(90000, "ANNUAL")).toBe(90000);
  });
});
