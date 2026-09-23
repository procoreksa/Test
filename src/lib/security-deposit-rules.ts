import { Prisma } from "@prisma/client";
import type { SettlementStatus, SettlementResponsibility, SettlementDisputeStatus, SecurityDepositLedgerEntryType } from "@prisma/client";

// ---------------------------------------------------------------------------
// Security Deposit & Move-Out Financial Settlement - pure domain logic.
//
// CRITICAL PRINCIPLE enforced throughout this module: FINDING != TENANT
// LIABILITY != FINANCIAL DEDUCTION. Nothing here ever infers a
// responsibility or an amount from a Move-Out finding - every function
// takes an already-made human decision (a `responsibility`, a
// `proposedAmount`, an `approvedAmount`) and only ever aggregates/validates
// it. See docs/SECURITY-DEPOSIT-SETTLEMENT.md.
//
// Decimal convention: this module uses Prisma.Decimal throughout (never
// native floating-point arithmetic), mirroring src/lib/owner-allocation.ts's
// own established convention for this exact class of problem (summing/
// comparing money amounts with no rate multiplication involved) - not the
// float+round2 convention src/lib/zatca/vat.ts uses for VAT-rate line
// computation, which is a different class of problem.
// ---------------------------------------------------------------------------

export type Money = Prisma.Decimal | number | string;

function toDecimal(value: Money): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

// ---------------------------------------------------------------------------
// Settlement lifecycle (Step 6) - centralized, exactly like
// MOVE_IN_TRANSITIONS/MOVE_OUT_TRANSITIONS in move-in-rules.ts/
// move-out-rules.ts. The four required separations (Step 6) map directly:
// assessment = DRAFT/UNDER_REVIEW/PENDING_APPROVAL, approval = APPROVED,
// posting = POSTED, cash settlement = PARTIALLY_SETTLED/SETTLED.
// ---------------------------------------------------------------------------

const SETTLEMENT_TRANSITIONS: Record<SettlementStatus, readonly SettlementStatus[]> = {
  DRAFT: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["PENDING_APPROVAL", "DRAFT", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "UNDER_REVIEW", "CANCELLED"],
  // Reopening an APPROVED settlement for correction (Step 49's own allowance)
  // goes back to UNDER_REVIEW, never straight to DRAFT - the approval
  // snapshot is discarded but the settlement is still considered "already
  // reviewed once," matching PENDING_APPROVAL's own reject-to-UNDER_REVIEW
  // step rather than skipping past it.
  APPROVED: ["POSTED", "UNDER_REVIEW"],
  POSTED: ["PARTIALLY_SETTLED", "SETTLED"],
  PARTIALLY_SETTLED: ["SETTLED"],
  SETTLED: [],
  CANCELLED: [],
};

export function isValidSettlementTransition(from: SettlementStatus, to: SettlementStatus): boolean {
  return SETTLEMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

const EDITABLE_SETTLEMENT_STATUSES: readonly SettlementStatus[] = ["DRAFT", "UNDER_REVIEW", "PENDING_APPROVAL"];

/** Assessments may be added/edited freely up to (not including) APPROVED - Step 49: "After approval, normal assessment editing should stop." */
export function isSettlementEditable(status: SettlementStatus): boolean {
  return EDITABLE_SETTLEMENT_STATUSES.includes(status);
}

export function isSettlementCancellable(status: SettlementStatus): boolean {
  return status === "DRAFT" || status === "UNDER_REVIEW" || status === "PENDING_APPROVAL";
}

// ---------------------------------------------------------------------------
// Eligibility (Step 4)
// ---------------------------------------------------------------------------

/** A settlement may be created only for a MoveOut whose status is COMPLETED - completion (Unit -> VACANT) remains completeMoveOut()'s own exclusive concern; this only reads that fact. */
export function isMoveOutEligibleForSettlement(moveOutStatus: string): boolean {
  return moveOutStatus === "COMPLETED";
}

// ---------------------------------------------------------------------------
// Deposit ledger (Step 26/27) - debit/credit sign convention, centralized so
// no call site ever decides ad hoc which side an entry type posts to.
// ---------------------------------------------------------------------------

export interface LedgerDebitCredit {
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
}

const ZERO = new Prisma.Decimal(0);

/**
 * The debit/credit pair for a new (non-reversal, non-adjustment) ledger
 * entry of the given type and unsigned amount. ADJUSTMENT is deliberately
 * excluded - an adjustment's side is never inferred, it's given directly by
 * whoever posts it (see createAdjustmentDebitCredit()).
 */
export function ledgerEntryDebitCredit(entryType: Exclude<SecurityDepositLedgerEntryType, "ADJUSTMENT" | "REVERSAL">, amount: Money): LedgerDebitCredit {
  const value = toDecimal(amount);
  if (entryType === "COLLECTION") return { debit: ZERO, credit: value };
  // APPLICATION and REFUND both reduce the liability held.
  return { debit: value, credit: ZERO };
}

/** A REVERSAL entry always carries the exact opposite debit/credit of the entry it reverses - never a re-derived amount. */
export function reversalDebitCredit(original: LedgerDebitCredit): LedgerDebitCredit {
  return { debit: original.credit, credit: original.debit };
}

export function createAdjustmentDebitCredit(amount: Money, side: "debit" | "credit"): LedgerDebitCredit {
  const value = toDecimal(amount);
  return side === "debit" ? { debit: value, credit: ZERO } : { debit: ZERO, credit: value };
}

/** Available Deposit Balance = SUM(credit) - SUM(debit), exactly mirroring the Owner Ledger's own balance convention (owner-ledger.ts). Never a separately-stored, independently-editable number (Step 27). */
export function computeAvailableDepositBalance(entries: readonly { debit: Money; credit: Money }[]): Prisma.Decimal {
  return entries.reduce((balance, e) => balance.plus(toDecimal(e.credit)).minus(toDecimal(e.debit)), new Prisma.Decimal(0));
}

// ---------------------------------------------------------------------------
// Liability assessment (Steps 9-17, 42-45, 96-97)
// ---------------------------------------------------------------------------

export interface AssessmentAmounts {
  responsibility: SettlementResponsibility;
  proposedAmount: Money;
  approvedAmount: Money | null;
  waivedAmount: Money;
}

export interface AssessmentValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates one assessment's amounts in isolation (Step 15/16/42/43):
 *   - only TENANT responsibility may carry a non-zero approvedAmount
 *     (Step 42/43/96 - a finding assigned to OWNER/PROPERTY_MANAGEMENT/
 *     VENDOR/WARRANTY/NO_CHARGE/UNDETERMINED/OTHER never becomes a tenant
 *     charge, no documented-exception override exists in V1)
 *   - approvedAmount + waivedAmount must never exceed proposedAmount
 *     (Step 16 - no double counting: Proposed=1000, Approved=600,
 *     Waived=400 is the exact worked example)
 *   - amounts may never be negative
 */
export function validateAssessmentAmounts(input: AssessmentAmounts): AssessmentValidationResult {
  const errors: string[] = [];
  const proposed = toDecimal(input.proposedAmount);
  const approved = input.approvedAmount === null ? null : toDecimal(input.approvedAmount);
  const waived = toDecimal(input.waivedAmount);

  if (proposed.lessThan(0)) errors.push("PROPOSED_AMOUNT_NEGATIVE");
  if (approved !== null && approved.lessThan(0)) errors.push("APPROVED_AMOUNT_NEGATIVE");
  if (waived.lessThan(0)) errors.push("WAIVED_AMOUNT_NEGATIVE");

  if (approved !== null && input.responsibility !== "TENANT" && !approved.equals(0)) {
    errors.push("NON_TENANT_RESPONSIBILITY_CANNOT_HAVE_APPROVED_AMOUNT");
  }

  if (approved !== null && approved.plus(waived).greaterThan(proposed)) {
    errors.push("APPROVED_PLUS_WAIVED_EXCEEDS_PROPOSED");
  }

  return { valid: errors.length === 0, errors };
}

export interface AssessmentForSum {
  responsibility: SettlementResponsibility;
  proposedAmount: Money;
  approvedAmount: Money | null;
  waivedAmount: Money;
}

/** Step 48's "Total Proposed Tenant Deductions" - TENANT-responsibility rows only, regardless of approval state yet. */
export function sumProposedTenantAmount(assessments: readonly AssessmentForSum[]): Prisma.Decimal {
  return assessments.filter((a) => a.responsibility === "TENANT").reduce((sum, a) => sum.plus(toDecimal(a.proposedAmount)), new Prisma.Decimal(0));
}

/**
 * Step 43/96 - "Total Approved Tenant Deductions": the ONLY figure that ever
 * feeds the settlement calculation (Step 18). Non-TENANT responsibility
 * (including UNDETERMINED, NO_CHARGE, OTHER) contributes zero, always -
 * this is the enforcement point for "Finding != Tenant Liability" at
 * aggregation time, on top of validateAssessmentAmounts()'s own
 * per-row enforcement at write time.
 */
export function sumApprovedTenantDeductions(assessments: readonly AssessmentForSum[]): Prisma.Decimal {
  return assessments
    .filter((a) => a.responsibility === "TENANT")
    .reduce((sum, a) => sum.plus(a.approvedAmount === null ? new Prisma.Decimal(0) : toDecimal(a.approvedAmount)), new Prisma.Decimal(0));
}

export function sumWaivedTenantAmount(assessments: readonly AssessmentForSum[]): Prisma.Decimal {
  return assessments.filter((a) => a.responsibility === "TENANT").reduce((sum, a) => sum.plus(toDecimal(a.waivedAmount)), new Prisma.Decimal(0));
}

export interface AssessmentForApproval {
  responsibility: SettlementResponsibility;
  disputeStatus: SettlementDisputeStatus;
}

export type ApprovalBlocker = "UNDETERMINED_RESPONSIBILITY_EXISTS" | "UNRESOLVED_DISPUTE_EXISTS" | "NO_ASSESSMENTS_YET";

/**
 * Step 48 - "Do not allow approval if mandatory decisions remain
 * unresolved" and Step 98 - "Disputed unresolved assessment must prevent
 * final approval/posting." An empty assessment list is not itself a
 * blocker (a completed Move-Out with genuinely nothing to assess is a
 * valid, normal zero-deduction settlement - Steps 14/20/90).
 */
export function getApprovalBlockers(assessments: readonly AssessmentForApproval[]): ApprovalBlocker[] {
  const blockers: ApprovalBlocker[] = [];
  if (assessments.some((a) => a.responsibility === "UNDETERMINED")) blockers.push("UNDETERMINED_RESPONSIBILITY_EXISTS");
  if (assessments.some((a) => a.disputeStatus === "RAISED" || a.disputeStatus === "UNDER_REVIEW")) blockers.push("UNRESOLVED_DISPUTE_EXISTS");
  return blockers;
}

// ---------------------------------------------------------------------------
// Settlement calculation (Steps 18-21, 90-95) - the one authoritative
// calculation. Every worked example in the brief is covered by the unit
// tests for this function.
// ---------------------------------------------------------------------------

export interface SettlementOutcome {
  depositApplied: Prisma.Decimal;
  refundDue: Prisma.Decimal;
  additionalDue: Prisma.Decimal;
}

/**
 * A = availableDeposit (ledger-derived, never the contractual requirement -
 * Step 7/19/20/21), D = total approved TENANT deductions (Step 43).
 *
 *   Deposit Applied = min(A, D)
 *   Refund Due      = max(A - D, 0)
 *   Additional Due  = max(D - A, 0)
 *
 * Handles A=0 (Step 20, no deposit collected), D=0 (Step 90, zero
 * deductions), A>D (Step 91), A=D (Step 92), A<D (Step 93), and an
 * over-collected A with no clamping (Step 21 - this function never
 * compares A against any contractual requirement at all).
 */
export function computeSettlementOutcome(availableDeposit: Money, totalApprovedTenantDeductions: Money): SettlementOutcome {
  const A = toDecimal(availableDeposit);
  const D = toDecimal(totalApprovedTenantDeductions);
  const depositApplied = Prisma.Decimal.min(A, D);
  const refundDue = Prisma.Decimal.max(A.minus(D), 0);
  const additionalDue = Prisma.Decimal.max(D.minus(A), 0);
  return { depositApplied, refundDue, additionalDue };
}

// ---------------------------------------------------------------------------
// Deposit collection from existing Invoice/Payment history (Step 7/19) -
// reuses the EXACT same whole-invoice proportional-share approximation
// src/lib/schedule-status.ts's recomputeScheduleStatus()/getScheduleRemaining()
// already establish and this codebase already accepts, rather than inventing
// a new, more precise allocation scheme this codebase has no per-line
// payment-allocation table to actually support.
// ---------------------------------------------------------------------------

export interface InvoiceForDepositPortion {
  totalAmount: Money;
  paidAmount: Money;
  /** Sum of this invoice's SECURITY_DEPOSIT line(s) lineTotal - 0 if none. */
  depositLineTotal: Money;
}

/** How much of one invoice's paid amount is attributable to its SECURITY_DEPOSIT line(s), by the invoice's own overall paid share. */
export function computeInvoiceDepositPortion(invoice: InvoiceForDepositPortion): Prisma.Decimal {
  const total = toDecimal(invoice.totalAmount);
  const paid = toDecimal(invoice.paidAmount);
  const depositLineTotal = toDecimal(invoice.depositLineTotal);
  if (total.lessThanOrEqualTo(0) || depositLineTotal.lessThanOrEqualTo(0)) return ZERO;
  const paidShare = Prisma.Decimal.min(1, paid.dividedBy(total));
  return depositLineTotal.times(paidShare).toDecimalPlaces(2);
}

// ---------------------------------------------------------------------------
// Refund (Steps 30-31, 54-56, 99) & completion definition (Steps 59-60)
// ---------------------------------------------------------------------------

/** Step 54/99 - Refund Due is never the same as Refund Paid; this is a pure comparison, never trusting a client-supplied "remaining" value. */
export function computeRefundRemaining(refundDue: Money, refundPaid: Money): Prisma.Decimal {
  return Prisma.Decimal.max(toDecimal(refundDue).minus(toDecimal(refundPaid)), 0);
}

export function isRefundAmountAllowed(requestedAmount: Money, refundDue: Money, refundPaid: Money): boolean {
  const remaining = computeRefundRemaining(refundDue, refundPaid);
  const requested = toDecimal(requestedAmount);
  return requested.greaterThan(0) && requested.lessThanOrEqualTo(remaining);
}

/**
 * Step 59 - one explicit, documented completion definition (never left
 * ambiguous): a settlement is SETTLED once POSTED and its refund
 * obligation (if any) is fully paid. The "Additional Tenant Amount Due"
 * side is considered handled by POSTING the receivable itself (Step 32/58
 * - actual collection of that receivable is tracked by the existing
 * Invoice/Payment system on its own terms, not re-tracked here), so it is
 * NOT a factor in this function - only the refund side gates SETTLED.
 */
export function computeSettlementCompletionStatus(refundDue: Money, refundPaid: Money): "SETTLED" | "PARTIALLY_SETTLED" | "POSTED" {
  const due = toDecimal(refundDue);
  const paid = toDecimal(refundPaid);
  if (due.lessThanOrEqualTo(0)) return "SETTLED";
  if (paid.greaterThanOrEqualTo(due)) return "SETTLED";
  if (paid.greaterThan(0)) return "PARTIALLY_SETTLED";
  return "POSTED";
}
