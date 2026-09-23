import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import type { SettlementStatus } from "@prisma/client";
import {
  isValidSettlementTransition,
  isSettlementEditable,
  isSettlementCancellable,
  isMoveOutEligibleForSettlement,
  ledgerEntryDebitCredit,
  reversalDebitCredit,
  createAdjustmentDebitCredit,
  computeAvailableDepositBalance,
  validateAssessmentAmounts,
  sumProposedTenantAmount,
  sumApprovedTenantDeductions,
  sumWaivedTenantAmount,
  getApprovalBlockers,
  computeSettlementOutcome,
  computeInvoiceDepositPortion,
  computeRefundRemaining,
  isRefundAmountAllowed,
  computeSettlementCompletionStatus,
} from "./security-deposit-rules";

const ALL_STATUSES: SettlementStatus[] = ["DRAFT", "UNDER_REVIEW", "PENDING_APPROVAL", "APPROVED", "POSTED", "PARTIALLY_SETTLED", "SETTLED", "CANCELLED"];

describe("settlement lifecycle transitions", () => {
  it("allows every documented forward transition", () => {
    expect(isValidSettlementTransition("DRAFT", "UNDER_REVIEW")).toBe(true);
    expect(isValidSettlementTransition("UNDER_REVIEW", "PENDING_APPROVAL")).toBe(true);
    expect(isValidSettlementTransition("PENDING_APPROVAL", "APPROVED")).toBe(true);
    expect(isValidSettlementTransition("APPROVED", "POSTED")).toBe(true);
    expect(isValidSettlementTransition("POSTED", "PARTIALLY_SETTLED")).toBe(true);
    expect(isValidSettlementTransition("POSTED", "SETTLED")).toBe(true);
    expect(isValidSettlementTransition("PARTIALLY_SETTLED", "SETTLED")).toBe(true);
  });

  it("allows the documented reopen/reject steps", () => {
    expect(isValidSettlementTransition("UNDER_REVIEW", "DRAFT")).toBe(true);
    expect(isValidSettlementTransition("PENDING_APPROVAL", "UNDER_REVIEW")).toBe(true);
    expect(isValidSettlementTransition("APPROVED", "UNDER_REVIEW")).toBe(true);
  });

  it("allows cancellation only before POSTED", () => {
    expect(isValidSettlementTransition("DRAFT", "CANCELLED")).toBe(true);
    expect(isValidSettlementTransition("UNDER_REVIEW", "CANCELLED")).toBe(true);
    expect(isValidSettlementTransition("PENDING_APPROVAL", "CANCELLED")).toBe(true);
    expect(isValidSettlementTransition("APPROVED", "CANCELLED")).toBe(false);
    expect(isValidSettlementTransition("POSTED", "CANCELLED")).toBe(false);
  });

  it("never allows skipping straight to APPROVED/POSTED/SETTLED from DRAFT", () => {
    expect(isValidSettlementTransition("DRAFT", "APPROVED")).toBe(false);
    expect(isValidSettlementTransition("DRAFT", "POSTED")).toBe(false);
    expect(isValidSettlementTransition("DRAFT", "SETTLED")).toBe(false);
  });

  it("SETTLED and CANCELLED are terminal - exhaustive all-pairs check", () => {
    for (const to of ALL_STATUSES) {
      expect(isValidSettlementTransition("SETTLED", to)).toBe(false);
      expect(isValidSettlementTransition("CANCELLED", to)).toBe(false);
    }
  });

  it("never reopens backward past what the brief allows (e.g. POSTED cannot go back to APPROVED)", () => {
    expect(isValidSettlementTransition("POSTED", "APPROVED")).toBe(false);
    expect(isValidSettlementTransition("PARTIALLY_SETTLED", "POSTED")).toBe(false);
  });
});

describe("isSettlementEditable / isSettlementCancellable", () => {
  it("assessment phase is editable, everything from APPROVED onward is not", () => {
    expect(isSettlementEditable("DRAFT")).toBe(true);
    expect(isSettlementEditable("UNDER_REVIEW")).toBe(true);
    expect(isSettlementEditable("PENDING_APPROVAL")).toBe(true);
    expect(isSettlementEditable("APPROVED")).toBe(false);
    expect(isSettlementEditable("POSTED")).toBe(false);
    expect(isSettlementEditable("SETTLED")).toBe(false);
    expect(isSettlementEditable("CANCELLED")).toBe(false);
  });

  it("cancellable only pre-approval", () => {
    expect(isSettlementCancellable("DRAFT")).toBe(true);
    expect(isSettlementCancellable("PENDING_APPROVAL")).toBe(true);
    expect(isSettlementCancellable("APPROVED")).toBe(false);
    expect(isSettlementCancellable("POSTED")).toBe(false);
  });
});

describe("isMoveOutEligibleForSettlement", () => {
  it("only COMPLETED is eligible", () => {
    expect(isMoveOutEligibleForSettlement("COMPLETED")).toBe(true);
    expect(isMoveOutEligibleForSettlement("READY_FOR_CLOSURE")).toBe(false);
    expect(isMoveOutEligibleForSettlement("IN_PROGRESS")).toBe(false);
    expect(isMoveOutEligibleForSettlement("DRAFT")).toBe(false);
    expect(isMoveOutEligibleForSettlement("CANCELLED")).toBe(false);
  });
});

describe("ledger debit/credit conventions", () => {
  it("COLLECTION credits, APPLICATION and REFUND debit", () => {
    expect(ledgerEntryDebitCredit("COLLECTION", 8000)).toEqual({ debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(8000) });
    expect(ledgerEntryDebitCredit("APPLICATION", 2500)).toEqual({ debit: new Prisma.Decimal(2500), credit: new Prisma.Decimal(0) });
    expect(ledgerEntryDebitCredit("REFUND", 5500)).toEqual({ debit: new Prisma.Decimal(5500), credit: new Prisma.Decimal(0) });
  });

  it("reversal swaps debit and credit of the original", () => {
    const original = ledgerEntryDebitCredit("COLLECTION", 1000);
    expect(reversalDebitCredit(original)).toEqual({ debit: new Prisma.Decimal(1000), credit: new Prisma.Decimal(0) });
  });

  it("adjustment posts to the explicitly given side only", () => {
    expect(createAdjustmentDebitCredit(300, "debit")).toEqual({ debit: new Prisma.Decimal(300), credit: new Prisma.Decimal(0) });
    expect(createAdjustmentDebitCredit(300, "credit")).toEqual({ debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(300) });
  });
});

describe("computeAvailableDepositBalance", () => {
  it("sums credit minus debit across entries", () => {
    const entries = [
      { debit: 0, credit: 8000 }, // COLLECTION
      { debit: 2500, credit: 0 }, // APPLICATION
      { debit: 5500, credit: 0 }, // REFUND
    ];
    expect(computeAvailableDepositBalance(entries).toNumber()).toBe(0);
  });

  it("returns 0 for no entries at all (no deposit collected)", () => {
    expect(computeAvailableDepositBalance([]).toNumber()).toBe(0);
  });

  it("reflects an over-collected deposit without any clamping", () => {
    const entries = [{ debit: 0, credit: 12000 }];
    expect(computeAvailableDepositBalance(entries).toNumber()).toBe(12000);
  });
});

describe("validateAssessmentAmounts", () => {
  it("accepts a valid TENANT assessment with proposed/approved/waived per the worked example", () => {
    const result = validateAssessmentAmounts({ responsibility: "TENANT", proposedAmount: 1000, approvedAmount: 600, waivedAmount: 400 });
    expect(result.valid).toBe(true);
  });

  it("rejects a non-TENANT assessment carrying a non-zero approved amount", () => {
    const result = validateAssessmentAmounts({ responsibility: "OWNER", proposedAmount: 1500, approvedAmount: 1500, waivedAmount: 0 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("NON_TENANT_RESPONSIBILITY_CANNOT_HAVE_APPROVED_AMOUNT");
  });

  it("allows a non-TENANT assessment with a zero approved amount", () => {
    const result = validateAssessmentAmounts({ responsibility: "OWNER", proposedAmount: 1500, approvedAmount: 0, waivedAmount: 0 });
    expect(result.valid).toBe(true);
  });

  it("allows UNDETERMINED/NO_CHARGE with null approved amount", () => {
    expect(validateAssessmentAmounts({ responsibility: "UNDETERMINED", proposedAmount: 500, approvedAmount: null, waivedAmount: 0 }).valid).toBe(true);
    expect(validateAssessmentAmounts({ responsibility: "NO_CHARGE", proposedAmount: 500, approvedAmount: null, waivedAmount: 0 }).valid).toBe(true);
  });

  it("supports a fully waived (zero-charge) deteriorated finding: normal wear and tear", () => {
    const result = validateAssessmentAmounts({ responsibility: "TENANT", proposedAmount: 500, approvedAmount: 0, waivedAmount: 500 });
    expect(result.valid).toBe(true);
  });

  it("rejects approved+waived exceeding proposed (double counting)", () => {
    const result = validateAssessmentAmounts({ responsibility: "TENANT", proposedAmount: 1000, approvedAmount: 700, waivedAmount: 400 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("APPROVED_PLUS_WAIVED_EXCEEDS_PROPOSED");
  });

  it("rejects negative amounts", () => {
    expect(validateAssessmentAmounts({ responsibility: "TENANT", proposedAmount: -1, approvedAmount: null, waivedAmount: 0 }).valid).toBe(false);
    expect(validateAssessmentAmounts({ responsibility: "TENANT", proposedAmount: 100, approvedAmount: -1, waivedAmount: 0 }).valid).toBe(false);
    expect(validateAssessmentAmounts({ responsibility: "TENANT", proposedAmount: 100, approvedAmount: 0, waivedAmount: -1 }).valid).toBe(false);
  });
});

describe("tenant-deduction aggregation - responsibility filtering (Step 43/96)", () => {
  const mixed = [
    { responsibility: "TENANT" as const, proposedAmount: 1000, approvedAmount: 600, waivedAmount: 400 },
    { responsibility: "OWNER" as const, proposedAmount: 1500, approvedAmount: 0, waivedAmount: 0 },
    { responsibility: "PROPERTY_MANAGEMENT" as const, proposedAmount: 300, approvedAmount: 0, waivedAmount: 0 },
    { responsibility: "UNDETERMINED" as const, proposedAmount: 200, approvedAmount: null, waivedAmount: 0 },
    { responsibility: "NO_CHARGE" as const, proposedAmount: 0, approvedAmount: 0, waivedAmount: 0 },
  ];

  it("sums only TENANT-responsibility approved amounts", () => {
    expect(sumApprovedTenantDeductions(mixed).toNumber()).toBe(600);
  });

  it("sums only TENANT-responsibility proposed amounts", () => {
    expect(sumProposedTenantAmount(mixed).toNumber()).toBe(1000);
  });

  it("sums only TENANT-responsibility waived amounts", () => {
    expect(sumWaivedTenantAmount(mixed).toNumber()).toBe(400);
  });

  it("non-tenant-liability test (Step 96): OWNER-responsibility maintenance amount contributes zero", () => {
    const assessments = [{ responsibility: "OWNER" as const, proposedAmount: 1500, approvedAmount: 0, waivedAmount: 0 }];
    expect(sumApprovedTenantDeductions(assessments).toNumber()).toBe(0);
  });
});

describe("getApprovalBlockers", () => {
  it("no blockers for an empty assessment list (a valid zero-deduction settlement)", () => {
    expect(getApprovalBlockers([])).toEqual([]);
  });

  it("blocks on any UNDETERMINED responsibility", () => {
    const blockers = getApprovalBlockers([{ responsibility: "UNDETERMINED", disputeStatus: "NONE" }]);
    expect(blockers).toContain("UNDETERMINED_RESPONSIBILITY_EXISTS");
  });

  it("blocks on a RAISED or UNDER_REVIEW dispute", () => {
    expect(getApprovalBlockers([{ responsibility: "TENANT", disputeStatus: "RAISED" }])).toContain("UNRESOLVED_DISPUTE_EXISTS");
    expect(getApprovalBlockers([{ responsibility: "TENANT", disputeStatus: "UNDER_REVIEW" }])).toContain("UNRESOLVED_DISPUTE_EXISTS");
  });

  it("does not block on a RESOLVED dispute", () => {
    expect(getApprovalBlockers([{ responsibility: "TENANT", disputeStatus: "RESOLVED" }])).toEqual([]);
  });

  it("no blockers when every assessment has an explicit non-UNDETERMINED responsibility and no unresolved dispute", () => {
    expect(getApprovalBlockers([{ responsibility: "TENANT", disputeStatus: "NONE" }, { responsibility: "NO_CHARGE", disputeStatus: "RESOLVED" }])).toEqual([]);
  });
});

describe("computeSettlementOutcome - every worked example in the brief", () => {
  it("Step 91 - partial deduction: A=8000, D=2500", () => {
    const r = computeSettlementOutcome(8000, 2500);
    expect(r.depositApplied.toNumber()).toBe(2500);
    expect(r.refundDue.toNumber()).toBe(5500);
    expect(r.additionalDue.toNumber()).toBe(0);
  });

  it("Step 93 - excess deduction: A=8000, D=10000", () => {
    const r = computeSettlementOutcome(8000, 10000);
    expect(r.depositApplied.toNumber()).toBe(8000);
    expect(r.refundDue.toNumber()).toBe(0);
    expect(r.additionalDue.toNumber()).toBe(2000);
  });

  it("Step 90 - zero deduction: A=8000, D=0", () => {
    const r = computeSettlementOutcome(8000, 0);
    expect(r.depositApplied.toNumber()).toBe(0);
    expect(r.refundDue.toNumber()).toBe(8000);
    expect(r.additionalDue.toNumber()).toBe(0);
  });

  it("Step 92 - full deposit application: A=8000, D=8000", () => {
    const r = computeSettlementOutcome(8000, 8000);
    expect(r.depositApplied.toNumber()).toBe(8000);
    expect(r.refundDue.toNumber()).toBe(0);
    expect(r.additionalDue.toNumber()).toBe(0);
  });

  it("Step 94 - partial collection: required=8000, collected(available)=5000, approved=7000", () => {
    const r = computeSettlementOutcome(5000, 7000);
    expect(r.depositApplied.toNumber()).toBe(5000);
    expect(r.refundDue.toNumber()).toBe(0);
    expect(r.additionalDue.toNumber()).toBe(2000);
  });

  it("Step 95 - no collection at all: available=0, approved=2000", () => {
    const r = computeSettlementOutcome(0, 2000);
    expect(r.depositApplied.toNumber()).toBe(0);
    expect(r.refundDue.toNumber()).toBe(0);
    expect(r.additionalDue.toNumber()).toBe(2000);
  });

  it("both zero: no deposit, no deductions", () => {
    const r = computeSettlementOutcome(0, 0);
    expect(r.depositApplied.toNumber()).toBe(0);
    expect(r.refundDue.toNumber()).toBe(0);
    expect(r.additionalDue.toNumber()).toBe(0);
  });

  it("over-collected deposit with modest deductions still fully refunds the remainder (Step 21 - no clamping to a contractual figure anywhere in this function)", () => {
    const r = computeSettlementOutcome(12000, 1000);
    expect(r.depositApplied.toNumber()).toBe(1000);
    expect(r.refundDue.toNumber()).toBe(11000);
    expect(r.additionalDue.toNumber()).toBe(0);
  });
});

describe("computeInvoiceDepositPortion - whole-invoice proportional-share convention (Step 7/19)", () => {
  it("attributes the full deposit line when the invoice is fully paid", () => {
    expect(computeInvoiceDepositPortion({ totalAmount: 8000, paidAmount: 8000, depositLineTotal: 8000 }).toNumber()).toBe(8000);
  });

  it("attributes a proportional share when the invoice mixing rent+deposit is partially paid", () => {
    // Invoice total 10000 (8000 deposit + 2000 rent), 50% paid -> deposit portion 4000
    expect(computeInvoiceDepositPortion({ totalAmount: 10000, paidAmount: 5000, depositLineTotal: 8000 }).toNumber()).toBe(4000);
  });

  it("returns 0 when nothing has been paid", () => {
    expect(computeInvoiceDepositPortion({ totalAmount: 8000, paidAmount: 0, depositLineTotal: 8000 }).toNumber()).toBe(0);
  });

  it("returns 0 when the invoice has no deposit line at all", () => {
    expect(computeInvoiceDepositPortion({ totalAmount: 5000, paidAmount: 5000, depositLineTotal: 0 }).toNumber()).toBe(0);
  });

  it("clamps an over-paid invoice's share at 100%, never exceeding the deposit line itself", () => {
    expect(computeInvoiceDepositPortion({ totalAmount: 8000, paidAmount: 9000, depositLineTotal: 8000 }).toNumber()).toBe(8000);
  });

  it("returns 0 for a zero/invalid totalAmount rather than dividing by zero", () => {
    expect(computeInvoiceDepositPortion({ totalAmount: 0, paidAmount: 0, depositLineTotal: 8000 }).toNumber()).toBe(0);
  });
});

describe("refund due vs paid (Steps 54, 99)", () => {
  it("computes remaining correctly across sequential partial refunds", () => {
    expect(computeRefundRemaining(5500, 0).toNumber()).toBe(5500);
    expect(computeRefundRemaining(5500, 3000).toNumber()).toBe(2500);
    expect(computeRefundRemaining(5500, 5500).toNumber()).toBe(0);
  });

  it("never goes negative even if overpaid somehow", () => {
    expect(computeRefundRemaining(5500, 6000).toNumber()).toBe(0);
  });

  it("Step 99 - allows a valid partial refund, then the exact remaining amount, then rejects any further amount", () => {
    expect(isRefundAmountAllowed(3000, 5500, 0)).toBe(true);
    expect(isRefundAmountAllowed(2500, 5500, 3000)).toBe(true);
    expect(isRefundAmountAllowed(1, 5500, 5500)).toBe(false);
  });

  it("rejects an over-refund attempt even as a single payment", () => {
    expect(isRefundAmountAllowed(6000, 5500, 0)).toBe(false);
  });

  it("rejects a zero or negative refund amount", () => {
    expect(isRefundAmountAllowed(0, 5500, 0)).toBe(false);
    expect(isRefundAmountAllowed(-100, 5500, 0)).toBe(false);
  });
});

describe("computeSettlementCompletionStatus (Step 59 definition)", () => {
  it("SETTLED immediately when there is no refund due at all", () => {
    expect(computeSettlementCompletionStatus(0, 0)).toBe("SETTLED");
  });

  it("POSTED (not yet settled) when a refund is due and nothing has been paid", () => {
    expect(computeSettlementCompletionStatus(5500, 0)).toBe("POSTED");
  });

  it("PARTIALLY_SETTLED when some but not all of the refund has been paid", () => {
    expect(computeSettlementCompletionStatus(5500, 3000)).toBe("PARTIALLY_SETTLED");
  });

  it("SETTLED once the refund is fully paid", () => {
    expect(computeSettlementCompletionStatus(5500, 5500)).toBe("SETTLED");
  });
});
