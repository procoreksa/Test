/**
 * Real, database-backed cross-organization / IDOR / same-org
 * relation-injection tests for the Security Deposit & Move-Out Financial
 * Settlement module. Every mutating and read action must re-verify
 * organizationId server-side and never trust a client-supplied id across
 * the entity matrix: settlementId, moveOutId, contractId, assessmentId,
 * inspectionItemId/inventoryItemId/keyItemId/maintenanceRequestId
 * (evidence), refundId/ledgerEntryId. Mirrors the same strategy already
 * established by move-out-cross-org-security.db.test.ts.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestContract, driveMoveOutToCompletion, payDepositInvoice, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let orgA: SeededOrg;
let orgB: SeededOrg;
let settlementA: { id: string; moveOutId: string; contractId: string };
let assessmentA: { id: string };
let ledgerEntryA: { id: string };
let refundA: { id: string };

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

async function asOrgA<T>(cb: () => Promise<T>): Promise<T> {
  mockAuth.mockResolvedValue(orgA.session);
  return cb();
}

beforeAll(async () => {
  await resetDatabase();
  orgA = await seedFullOrg("SDX-A");
  orgB = await seedFullOrg("SDX-B");

  await asOrgA(async () => {
    const { contract } = await createTestContract(orgA, { unitNumber: `SDX-A-1-${Date.now()}` });
    await prisma.contract.update({ where: { id: contract.id }, data: { securityDeposit: 8000 } });
    await payDepositInvoice(orgA.organization.id, orgA.renter.id, contract.id, 8000);
    const moveOutId = await driveMoveOutToCompletion(contract.id);

    const { createSecurityDepositSettlement, addLiabilityAssessment, updateLiabilityAssessment, postSecurityDepositLedgerAdjustment } = await import("@/lib/actions/security-deposits");
    const settlementId = await createSecurityDepositSettlement(moveOutId);
    await addLiabilityAssessment(fd({ settlementId, sourceType: "OTHER", description: "Damage", category: "DAMAGE", proposedAmount: "1000" }));
    const assessment = await prisma.moveOutLiabilityAssessment.findFirstOrThrow({ where: { settlementId } });
    await updateLiabilityAssessment(fd({ assessmentId: assessment.id, responsibility: "TENANT", proposedAmount: "1000", approvedAmount: "1000", waivedAmount: "0" }));
    settlementA = { id: settlementId, moveOutId, contractId: contract.id };
    assessmentA = { id: assessment.id };

    await postSecurityDepositLedgerAdjustment(fd({ contractId: contract.id, amount: "100", side: "credit", description: "Adjustment" }));
    const ledgerEntry = await prisma.securityDepositLedgerEntry.findFirstOrThrow({ where: { contractId: contract.id, entryType: "ADJUSTMENT" } });
    ledgerEntryA = { id: ledgerEntry.id };

    const { submitSettlementForReview, reviewSettlement, approveSettlement, postSecurityDepositSettlement, recordSecurityDepositRefund } = await import("@/lib/actions/security-deposits");
    await submitSettlementForReview(settlementId);
    await reviewSettlement(settlementId, "FORWARD");
    await approveSettlement(settlementId);
    await postSecurityDepositSettlement(settlementId);
    const refundId = await recordSecurityDepositRefund(fd({ settlementId, amount: "1000", method: "CASH" }));
    refundA = { id: refundId };
  });
});

beforeEach(() => {
  mockAuth.mockReset();
  mockAuth.mockResolvedValue(orgB.session);
});

describe("Cross-organization isolation: Org B cannot reach Org A's settlement data", () => {
  it("getSecurityDepositSettlementById rejects Org A's settlementId", async () => {
    const { getSecurityDepositSettlementById } = await import("@/lib/actions/security-deposits");
    await expect(getSecurityDepositSettlementById(settlementA.id)).rejects.toThrow();
  });

  it("getSettlementForMoveOut/getSettlementForContract return null rather than leaking Org A's row", async () => {
    const { getSettlementForMoveOut, getSettlementForContract } = await import("@/lib/actions/security-deposits");
    expect(await getSettlementForMoveOut(settlementA.moveOutId)).toBeNull();
    expect(await getSettlementForContract(settlementA.contractId)).toBeNull();
  });

  it("getDepositPositionForContract rejects Org A's contractId", async () => {
    const { getDepositPositionForContract } = await import("@/lib/actions/security-deposits");
    await expect(getDepositPositionForContract(settlementA.contractId)).rejects.toThrow();
  });

  it("createSecurityDepositSettlement rejects Org A's moveOutId (cannot forge a settlement onto another org's Move-Out)", async () => {
    const { createSecurityDepositSettlement } = await import("@/lib/actions/security-deposits");
    await expect(createSecurityDepositSettlement(settlementA.moveOutId)).rejects.toThrow();
    expect(await prisma.securityDepositSettlement.count({ where: { moveOutId: settlementA.moveOutId } })).toBe(1);
  });

  it("addLiabilityAssessment rejects a settlementId belonging to Org A", async () => {
    const { addLiabilityAssessment } = await import("@/lib/actions/security-deposits");
    await expect(
      addLiabilityAssessment(fd({ settlementId: settlementA.id, sourceType: "OTHER", description: "Injected", category: "OTHER", proposedAmount: "1" }))
    ).rejects.toThrow();
    expect(await prisma.moveOutLiabilityAssessment.count({ where: { settlementId: settlementA.id, description: "Injected" } })).toBe(0);
  });

  it("updateLiabilityAssessment and updateAssessmentDispute reject an assessmentId belonging to Org A", async () => {
    const { updateLiabilityAssessment, updateAssessmentDispute } = await import("@/lib/actions/security-deposits");
    await expect(
      updateLiabilityAssessment(fd({ assessmentId: assessmentA.id, responsibility: "TENANT", proposedAmount: "999999", approvedAmount: "999999", waivedAmount: "0" }))
    ).rejects.toThrow();
    await expect(updateAssessmentDispute(fd({ assessmentId: assessmentA.id, disputeStatus: "RAISED" }))).rejects.toThrow();
    const unchanged = await prisma.moveOutLiabilityAssessment.findUniqueOrThrow({ where: { id: assessmentA.id } });
    expect(Number(unchanged.proposedAmount)).toBe(1000);
  });

  it("submitSettlementForReview/reviewSettlement/approveSettlement/postSecurityDepositSettlement/cancelSettlement all reject Org A's settlementId", async () => {
    const { submitSettlementForReview, reviewSettlement, approveSettlement, postSecurityDepositSettlement, cancelSettlement } = await import("@/lib/actions/security-deposits");
    await expect(submitSettlementForReview(settlementA.id)).rejects.toThrow();
    await expect(reviewSettlement(settlementA.id, "FORWARD")).rejects.toThrow();
    await expect(approveSettlement(settlementA.id)).rejects.toThrow();
    await expect(postSecurityDepositSettlement(settlementA.id)).rejects.toThrow();
    await expect(cancelSettlement(fd({ settlementId: settlementA.id, reason: "hostile" }))).rejects.toThrow();
    // Org A's own settlement was already POSTED/SETTLED by the fixture setup - untouched.
    const stillOrgAs = await prisma.securityDepositSettlement.findUniqueOrThrow({ where: { id: settlementA.id } });
    expect(stillOrgAs.organizationId).toBe(orgA.organization.id);
  });

  it("recordSecurityDepositRefund rejects Org A's settlementId", async () => {
    const { recordSecurityDepositRefund } = await import("@/lib/actions/security-deposits");
    await expect(recordSecurityDepositRefund(fd({ settlementId: settlementA.id, amount: "1", method: "CASH" }))).rejects.toThrow();
  });

  it("postSecurityDepositLedgerAdjustment and reverseSecurityDepositLedgerEntry reject Org A's contractId/entryId", async () => {
    const { postSecurityDepositLedgerAdjustment, reverseSecurityDepositLedgerEntry } = await import("@/lib/actions/security-deposits");
    await expect(postSecurityDepositLedgerAdjustment(fd({ contractId: settlementA.contractId, amount: "1", side: "debit", description: "hostile" }))).rejects.toThrow();
    await expect(reverseSecurityDepositLedgerEntry(ledgerEntryA.id)).rejects.toThrow();
    expect(await prisma.securityDepositLedgerEntry.findUnique({ where: { reversalOfEntryId: ledgerEntryA.id } })).toBeNull();
  });

  it("listSecurityDepositSettlements never returns Org A's rows, and the dashboard KPIs never count them", async () => {
    const { listSecurityDepositSettlements, getSecurityDepositDashboardKpis } = await import("@/lib/actions/security-deposits");
    const { rows } = await listSecurityDepositSettlements({});
    expect(rows.some((r) => r.id === settlementA.id)).toBe(false);
    const kpis = await getSecurityDepositDashboardKpis();
    expect(kpis.pendingReview + kpis.pendingApproval + kpis.approvedNotPosted).toBe(0);
  });

  it("refund/settlement rows from Org A are never returned by Org B's report queries", async () => {
    const { getRefundReport, getSettlementReport } = await import("@/lib/actions/security-deposit-reports");
    const refundReport = await getRefundReport();
    expect(refundReport.rows.some((r) => r.id === settlementA.id)).toBe(false);
    expect(refundReport.rows.some((r) => r.refunds.some((f) => f.id === refundA.id))).toBe(false);
    const settlementReport = await getSettlementReport();
    expect(settlementReport.rows.some((r) => r.id === settlementA.id)).toBe(false);
  });
});

describe("Same-org relation injection: evidence must belong to the settlement's own Move-Out", () => {
  it("rejects an inspection-item id that belongs to a different Move-Out in the same organization", async () => {
    await asOrgA(async () => {
      // A second, independent completed Move-Out (different Contract/Unit)
      // in the SAME organization as settlementA.
      const { contract: otherContract } = await createTestContract(orgA, { unitNumber: `SDX-A-2-${Date.now()}` });
      const otherMoveOutId = await driveMoveOutToCompletion(otherContract.id);

      const { createSecurityDepositSettlement, addLiabilityAssessment } = await import("@/lib/actions/security-deposits");
      const otherSettlementId = await createSecurityDepositSettlement(otherMoveOutId);

      // Attempt to inject settlementA's sibling item into a DIFFERENT
      // settlement (otherSettlementId) - same org, wrong Move-Out.
      await expect(
        addLiabilityAssessment(
          fd({
            settlementId: otherSettlementId,
            sourceType: "INSPECTION_ITEM",
            moveOutInspectionItemId: (await prisma.moveOutInspectionItem.findFirstOrThrow({ where: { moveOutId: settlementA.moveOutId } })).id,
            description: "Cross-moveout injection",
            category: "DAMAGE",
            proposedAmount: "1",
          })
        )
      ).rejects.toThrow();

      expect(await prisma.moveOutLiabilityAssessment.count({ where: { settlementId: otherSettlementId } })).toBe(0);
    });
  });
});
