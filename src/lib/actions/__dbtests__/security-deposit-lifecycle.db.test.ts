/**
 * Real, database-backed lifecycle/calculation tests for the Security
 * Deposit & Move-Out Financial Settlement module
 * (docs/SECURITY-DEPOSIT-SETTLEMENT.md): eligibility, the full happy-path
 * workflow (DRAFT -> ... -> SETTLED), every worked calculation example from
 * the spec against a real DB, approval blockers, the frozen commercial
 * snapshot, and the invariant that Move-In/Move-Out/Unit.status/
 * Contract.status are never touched by settlement activity.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestContract, driveMoveOutToCompletion, payDepositInvoice, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("SDL");
});

beforeEach(() => {
  mockAuth.mockReset();
  mockAuth.mockResolvedValue(org.session);
});

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

async function setupCompletedMoveOut(label: string, depositAmount: number, contractDeposit: number, paidAmount = depositAmount) {
  const { contract, unit } = await createTestContract(org, { unitNumber: `${label}-${Date.now()}` });
  await prisma.contract.update({ where: { id: contract.id }, data: { securityDeposit: contractDeposit } });
  if (depositAmount > 0) {
    await payDepositInvoice(org.organization.id, org.renter.id, contract.id, depositAmount, paidAmount);
  }
  const moveOutId = await driveMoveOutToCompletion(contract.id);
  return { contract, unit, moveOutId };
}

describe("Security Deposit Settlement eligibility", () => {
  it("rejects creating a settlement for a Move-Out that is not COMPLETED", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `SDL-ELIG-${Date.now()}` });
    const { createMoveOut } = await import("@/lib/actions/move-outs");
    const moveOutId = await createMoveOut(fd({ contractId: contract.id }));
    const { createSecurityDepositSettlement } = await import("@/lib/actions/security-deposits");
    await expect(createSecurityDepositSettlement(moveOutId)).rejects.toThrow();
    expect(await prisma.securityDepositSettlement.count({ where: { moveOutId } })).toBe(0);
  });

  it("rejects creating a second settlement for the same Move-Out (DB-unique on moveOutId)", async () => {
    const { moveOutId } = await setupCompletedMoveOut("SDL-DUP", 8000, 8000);
    const { createSecurityDepositSettlement } = await import("@/lib/actions/security-deposits");
    const firstId = await createSecurityDepositSettlement(moveOutId);
    await expect(createSecurityDepositSettlement(moveOutId)).rejects.toThrow();
    expect(await prisma.securityDepositSettlement.count({ where: { moveOutId } })).toBe(1);
    const settlement = await prisma.securityDepositSettlement.findUniqueOrThrow({ where: { id: firstId } });
    expect(settlement.status).toBe("DRAFT");
  });
});

describe("Security Deposit Settlement full lifecycle", () => {
  it("drives DRAFT -> UNDER_REVIEW -> PENDING_APPROVAL -> APPROVED -> POSTED -> SETTLED, never touching MoveOut/Unit/Contract state", async () => {
    const { contract, unit, moveOutId } = await setupCompletedMoveOut("SDL-FULL", 8000, 8000);
    const {
      createSecurityDepositSettlement,
      addLiabilityAssessment,
      updateLiabilityAssessment,
      submitSettlementForReview,
      reviewSettlement,
      approveSettlement,
      postSecurityDepositSettlement,
      recordSecurityDepositRefund,
      getSecurityDepositSettlementById,
    } = await import("@/lib/actions/security-deposits");

    const settlementId = await createSecurityDepositSettlement(moveOutId);
    expect((await prisma.securityDepositSettlement.findUniqueOrThrow({ where: { id: settlementId } })).status).toBe("DRAFT");

    // A finding is evidence only - adding an assessment defaults to
    // UNDETERMINED, never TENANT, and contributes nothing until an
    // authorized human explicitly assigns responsibility and an amount.
    await addLiabilityAssessment(
      fd({
        settlementId,
        sourceType: "OTHER",
        description: "Damaged wall paint",
        category: "DAMAGE",
        proposedAmount: "2500",
      })
    );
    const assessment = await prisma.moveOutLiabilityAssessment.findFirstOrThrow({ where: { settlementId } });
    expect(assessment.responsibility).toBe("UNDETERMINED");

    // Approval must be blocked while responsibility remains UNDETERMINED.
    await submitSettlementForReview(settlementId);
    await reviewSettlement(settlementId, "FORWARD");
    await expect(approveSettlement(settlementId)).rejects.toThrow();
    expect((await prisma.securityDepositSettlement.findUniqueOrThrow({ where: { id: settlementId } })).status).toBe("PENDING_APPROVAL");

    // The deliberate human decision: TENANT responsibility, approved amount 2500.
    await updateLiabilityAssessment(
      fd({ assessmentId: assessment.id, responsibility: "TENANT", proposedAmount: "2500", approvedAmount: "2500", waivedAmount: "0" })
    );

    await approveSettlement(settlementId);
    const approved = await prisma.securityDepositSettlement.findUniqueOrThrow({ where: { id: settlementId } });
    expect(approved.status).toBe("APPROVED");
    // Worked example: A=8000, D=2500 -> Applied=2500, Refund=5500, Additional=0.
    expect(Number(approved.approvedAvailableDeposit)).toBe(8000);
    expect(Number(approved.approvedTenantDeductions)).toBe(2500);
    expect(Number(approved.approvedDepositApplied)).toBe(2500);
    expect(Number(approved.approvedRefundDue)).toBe(5500);
    expect(Number(approved.approvedAdditionalDue)).toBe(0);

    // Post-approval: normal assessment editing stops.
    await expect(
      updateLiabilityAssessment(fd({ assessmentId: assessment.id, responsibility: "TENANT", proposedAmount: "2500", approvedAmount: "999", waivedAmount: "0" }))
    ).rejects.toThrow();

    await postSecurityDepositSettlement(settlementId);
    const posted = await prisma.securityDepositSettlement.findUniqueOrThrow({ where: { id: settlementId } });
    expect(posted.status).toBe("POSTED");
    const applicationEntry = await prisma.securityDepositLedgerEntry.findFirstOrThrow({ where: { organizationId: org.organization.id, settlementId, entryType: "APPLICATION" } });
    expect(Number(applicationEntry.debit)).toBe(2500);

    await recordSecurityDepositRefund(fd({ settlementId, amount: "5500", method: "BANK_TRANSFER", referenceNumber: "REF-1" }));
    const settled = await prisma.securityDepositSettlement.findUniqueOrThrow({ where: { id: settlementId } });
    expect(settled.status).toBe("SETTLED");
    expect(settled.settledAt).not.toBeNull();

    const { refundPaid, refundRemaining } = await getSecurityDepositSettlementById(settlementId);
    expect(Number(refundPaid)).toBe(5500);
    expect(Number(refundRemaining)).toBe(0);

    // Move-Out/Unit/Contract must never be touched by settlement activity.
    const moveOutAfter = await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } });
    expect(moveOutAfter.status).toBe("COMPLETED");
    const unitAfter = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    expect(unitAfter.status).toBe("VACANT");
    const contractAfter = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(contractAfter.status).toBe("ACTIVE");
  });

  it("posting is idempotent - a second call never creates a second APPLICATION ledger entry or additional invoice", async () => {
    const { moveOutId } = await setupCompletedMoveOut("SDL-IDEMP", 8000, 8000);
    const { createSecurityDepositSettlement, addLiabilityAssessment, updateLiabilityAssessment, submitSettlementForReview, reviewSettlement, approveSettlement, postSecurityDepositSettlement } =
      await import("@/lib/actions/security-deposits");

    const settlementId = await createSecurityDepositSettlement(moveOutId);
    await addLiabilityAssessment(fd({ settlementId, sourceType: "OTHER", description: "Missing key", category: "MISSING_KEY_OR_ACCESS_DEVICE", proposedAmount: "10000" }));
    const assessment = await prisma.moveOutLiabilityAssessment.findFirstOrThrow({ where: { settlementId } });
    await updateLiabilityAssessment(fd({ assessmentId: assessment.id, responsibility: "TENANT", proposedAmount: "10000", approvedAmount: "10000", waivedAmount: "0" }));
    await submitSettlementForReview(settlementId);
    await reviewSettlement(settlementId, "FORWARD");
    await approveSettlement(settlementId);

    const firstId = await postSecurityDepositSettlement(settlementId);
    const secondId = await postSecurityDepositSettlement(settlementId);
    expect(secondId).toBe(firstId);

    const applicationCount = await prisma.securityDepositLedgerEntry.count({ where: { settlementId, entryType: "APPLICATION" } });
    expect(applicationCount).toBe(1);
    const invoiceCount = await prisma.invoice.count({ where: { settlementId } });
    expect(invoiceCount).toBe(1);
  });
});

describe("Settlement calculation worked examples (real DB)", () => {
  it("A=8000, D=10000 -> Applied=8000, Refund=0, Additional=2000", async () => {
    const { moveOutId } = await setupCompletedMoveOut("SDL-EX2", 8000, 8000);
    const { createSecurityDepositSettlement, addLiabilityAssessment, updateLiabilityAssessment, submitSettlementForReview, reviewSettlement, approveSettlement, postSecurityDepositSettlement } =
      await import("@/lib/actions/security-deposits");

    const settlementId = await createSecurityDepositSettlement(moveOutId);
    await addLiabilityAssessment(fd({ settlementId, sourceType: "OTHER", description: "Major damage", category: "DAMAGE", proposedAmount: "10000" }));
    const assessment = await prisma.moveOutLiabilityAssessment.findFirstOrThrow({ where: { settlementId } });
    await updateLiabilityAssessment(fd({ assessmentId: assessment.id, responsibility: "TENANT", proposedAmount: "10000", approvedAmount: "10000", waivedAmount: "0" }));
    await submitSettlementForReview(settlementId);
    await reviewSettlement(settlementId, "FORWARD");
    await approveSettlement(settlementId);

    const approved = await prisma.securityDepositSettlement.findUniqueOrThrow({ where: { id: settlementId } });
    expect(Number(approved.approvedDepositApplied)).toBe(8000);
    expect(Number(approved.approvedRefundDue)).toBe(0);
    expect(Number(approved.approvedAdditionalDue)).toBe(2000);

    await postSecurityDepositSettlement(settlementId);
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { settlementId } });
    expect(Number(invoice.totalAmount)).toBe(2000);
    // A settlement with a refund obligation of 0 is SETTLED immediately at posting.
    const posted = await prisma.securityDepositSettlement.findUniqueOrThrow({ where: { id: settlementId } });
    expect(posted.status).toBe("SETTLED");
  });

  it("A=8000, D=0 -> Applied=0, Refund=8000, Additional=0 (a valid, normal zero-deduction settlement)", async () => {
    const { moveOutId } = await setupCompletedMoveOut("SDL-EX3", 8000, 8000);
    const { createSecurityDepositSettlement, submitSettlementForReview, reviewSettlement, approveSettlement } = await import("@/lib/actions/security-deposits");
    const settlementId = await createSecurityDepositSettlement(moveOutId);
    await submitSettlementForReview(settlementId);
    await reviewSettlement(settlementId, "FORWARD");
    await approveSettlement(settlementId);
    const approved = await prisma.securityDepositSettlement.findUniqueOrThrow({ where: { id: settlementId } });
    expect(Number(approved.approvedDepositApplied)).toBe(0);
    expect(Number(approved.approvedRefundDue)).toBe(8000);
    expect(Number(approved.approvedAdditionalDue)).toBe(0);
  });

  it("partial collection: required=8000, collected(A)=5000, D=7000 -> Applied=5000, Refund=0, Additional=2000", async () => {
    const { moveOutId } = await setupCompletedMoveOut("SDL-EX4", 5000, 8000);
    const { createSecurityDepositSettlement, addLiabilityAssessment, updateLiabilityAssessment, submitSettlementForReview, reviewSettlement, approveSettlement } = await import(
      "@/lib/actions/security-deposits"
    );
    const settlementId = await createSecurityDepositSettlement(moveOutId);
    await addLiabilityAssessment(fd({ settlementId, sourceType: "OTHER", description: "Cleaning + damage", category: "CLEANING", proposedAmount: "7000" }));
    const assessment = await prisma.moveOutLiabilityAssessment.findFirstOrThrow({ where: { settlementId } });
    await updateLiabilityAssessment(fd({ assessmentId: assessment.id, responsibility: "TENANT", proposedAmount: "7000", approvedAmount: "7000", waivedAmount: "0" }));
    await submitSettlementForReview(settlementId);
    await reviewSettlement(settlementId, "FORWARD");
    await approveSettlement(settlementId);
    const approved = await prisma.securityDepositSettlement.findUniqueOrThrow({ where: { id: settlementId } });
    expect(Number(approved.approvedAvailableDeposit)).toBe(5000);
    expect(Number(approved.approvedDepositApplied)).toBe(5000);
    expect(Number(approved.approvedRefundDue)).toBe(0);
    expect(Number(approved.approvedAdditionalDue)).toBe(2000);
  });

  it("no collection: A=0, D=2000 -> Applied=0, Refund=0, Additional=2000", async () => {
    const { moveOutId } = await setupCompletedMoveOut("SDL-EX5", 0, 8000);
    const { createSecurityDepositSettlement, addLiabilityAssessment, updateLiabilityAssessment, submitSettlementForReview, reviewSettlement, approveSettlement } = await import(
      "@/lib/actions/security-deposits"
    );
    const settlementId = await createSecurityDepositSettlement(moveOutId);
    await addLiabilityAssessment(fd({ settlementId, sourceType: "OTHER", description: "Unreturned item", category: "MISSING_INVENTORY", proposedAmount: "2000" }));
    const assessment = await prisma.moveOutLiabilityAssessment.findFirstOrThrow({ where: { settlementId } });
    await updateLiabilityAssessment(fd({ assessmentId: assessment.id, responsibility: "TENANT", proposedAmount: "2000", approvedAmount: "2000", waivedAmount: "0" }));
    await submitSettlementForReview(settlementId);
    await reviewSettlement(settlementId, "FORWARD");
    await approveSettlement(settlementId);
    const approved = await prisma.securityDepositSettlement.findUniqueOrThrow({ where: { id: settlementId } });
    expect(Number(approved.approvedAvailableDeposit)).toBe(0);
    expect(Number(approved.approvedDepositApplied)).toBe(0);
    expect(Number(approved.approvedRefundDue)).toBe(0);
    expect(Number(approved.approvedAdditionalDue)).toBe(2000);
  });

  it("over-collected deposit is never silently clamped to the contractual requirement", async () => {
    const { moveOutId } = await setupCompletedMoveOut("SDL-EX6", 9000, 8000);
    const { getDepositPositionForContract, createSecurityDepositSettlement } = await import("@/lib/actions/security-deposits");
    const settlementId = await createSecurityDepositSettlement(moveOutId);
    const settlement = await prisma.securityDepositSettlement.findUniqueOrThrow({ where: { id: settlementId } });
    const position = await getDepositPositionForContract(settlement.contractId);
    expect(Number(position.requiredDeposit)).toBe(8000);
    expect(Number(position.availableDeposit)).toBe(9000);
    expect(position.isOverCollected).toBe(true);
  });
});

describe("Approval blockers", () => {
  it("blocks approval while an unresolved dispute exists, even with TENANT responsibility and a valid amount", async () => {
    const { moveOutId } = await setupCompletedMoveOut("SDL-DISP", 8000, 8000);
    const { createSecurityDepositSettlement, addLiabilityAssessment, updateLiabilityAssessment, updateAssessmentDispute, submitSettlementForReview, reviewSettlement, approveSettlement } = await import(
      "@/lib/actions/security-deposits"
    );
    const settlementId = await createSecurityDepositSettlement(moveOutId);
    await addLiabilityAssessment(fd({ settlementId, sourceType: "OTHER", description: "Disputed damage", category: "DAMAGE", proposedAmount: "1000" }));
    const assessment = await prisma.moveOutLiabilityAssessment.findFirstOrThrow({ where: { settlementId } });
    await updateLiabilityAssessment(fd({ assessmentId: assessment.id, responsibility: "TENANT", proposedAmount: "1000", approvedAmount: "1000", waivedAmount: "0" }));
    await updateAssessmentDispute(fd({ assessmentId: assessment.id, disputeStatus: "RAISED", disputeNote: "Tenant disagrees" }));

    await submitSettlementForReview(settlementId);
    await reviewSettlement(settlementId, "FORWARD");
    await expect(approveSettlement(settlementId)).rejects.toThrow();

    await updateAssessmentDispute(fd({ assessmentId: assessment.id, disputeStatus: "RESOLVED", disputeNote: "Agreed" }));
    await approveSettlement(settlementId);
    expect((await prisma.securityDepositSettlement.findUniqueOrThrow({ where: { id: settlementId } })).status).toBe("APPROVED");
  });

  it("never allows a non-TENANT responsibility to carry a non-zero approved amount", async () => {
    const { moveOutId } = await setupCompletedMoveOut("SDL-NONTENANT", 8000, 8000);
    const { createSecurityDepositSettlement, addLiabilityAssessment, updateLiabilityAssessment } = await import("@/lib/actions/security-deposits");
    const settlementId = await createSecurityDepositSettlement(moveOutId);
    await addLiabilityAssessment(fd({ settlementId, sourceType: "OTHER", description: "Owner's own maintenance", category: "MAINTENANCE", proposedAmount: "500" }));
    const assessment = await prisma.moveOutLiabilityAssessment.findFirstOrThrow({ where: { settlementId } });
    await expect(
      updateLiabilityAssessment(fd({ assessmentId: assessment.id, responsibility: "OWNER", proposedAmount: "500", approvedAmount: "500", waivedAmount: "0" }))
    ).rejects.toThrow();
  });
});
