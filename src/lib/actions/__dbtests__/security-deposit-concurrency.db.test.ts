/**
 * Real, database-backed, deterministic (no-sleep) concurrency tests for the
 * Security Deposit & Move-Out Financial Settlement module: duplicate
 * settlement creation for the same Move-Out, a double-posting race on the
 * same settlement, and a simultaneous-refund-overdraw race - all using
 * genuine Promise.allSettled() concurrency, mirroring the same
 * Serializable-transaction protection strategy already established by
 * move-out-concurrency.db.test.ts / reservation-contract-concurrency.db.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestContract, driveMoveOutToCompletion, payDepositInvoice, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeEach(async () => {
  await resetDatabase();
  org = await seedFullOrg("SDC");
  mockAuth.mockResolvedValue(org.session);
});

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

async function setupCompletedMoveOut(label: string, depositAmount: number, contractDeposit: number) {
  const { contract } = await createTestContract(org, { unitNumber: `${label}-${Date.now()}` });
  await prisma.contract.update({ where: { id: contract.id }, data: { securityDeposit: contractDeposit } });
  if (depositAmount > 0) await payDepositInvoice(org.organization.id, org.renter.id, contract.id, depositAmount);
  const moveOutId = await driveMoveOutToCompletion(contract.id);
  return { contract, moveOutId };
}

describe("Duplicate settlement creation concurrency", () => {
  it("of two simultaneous createSecurityDepositSettlement() calls for the same Move-Out, exactly one settlement results", async () => {
    const { moveOutId } = await setupCompletedMoveOut("SDC-DUP", 8000, 8000);
    const { createSecurityDepositSettlement } = await import("@/lib/actions/security-deposits");

    const results = await Promise.allSettled([createSecurityDepositSettlement(moveOutId), createSecurityDepositSettlement(moveOutId)]);
    const fulfilled = results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled");
    expect(fulfilled.length).toBe(1);

    const settlements = await prisma.securityDepositSettlement.findMany({ where: { moveOutId } });
    expect(settlements).toHaveLength(1);
  });
});

describe("Double-posting concurrency", () => {
  it("of two simultaneous postSecurityDepositSettlement() calls, exactly one financial posting set results", async () => {
    const { moveOutId } = await setupCompletedMoveOut("SDC-POST", 8000, 8000);
    const { createSecurityDepositSettlement, addLiabilityAssessment, updateLiabilityAssessment, submitSettlementForReview, reviewSettlement, approveSettlement, postSecurityDepositSettlement } =
      await import("@/lib/actions/security-deposits");

    const settlementId = await createSecurityDepositSettlement(moveOutId);
    await addLiabilityAssessment(fd({ settlementId, sourceType: "OTHER", description: "Damage", category: "DAMAGE", proposedAmount: "3000" }));
    const assessment = await prisma.moveOutLiabilityAssessment.findFirstOrThrow({ where: { settlementId } });
    await updateLiabilityAssessment(fd({ assessmentId: assessment.id, responsibility: "TENANT", proposedAmount: "3000", approvedAmount: "3000", waivedAmount: "0" }));
    await submitSettlementForReview(settlementId);
    await reviewSettlement(settlementId, "FORWARD");
    await approveSettlement(settlementId);

    const results = await Promise.allSettled([postSecurityDepositSettlement(settlementId), postSecurityDepositSettlement(settlementId)]);
    const fulfilled = results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    if (fulfilled.length === 2) expect(fulfilled[0].value).toBe(fulfilled[1].value);

    const applicationCount = await prisma.securityDepositLedgerEntry.count({ where: { settlementId, entryType: "APPLICATION" } });
    expect(applicationCount).toBe(1);

    const settlement = await prisma.securityDepositSettlement.findUniqueOrThrow({ where: { id: settlementId } });
    expect(["POSTED", "PARTIALLY_SETTLED", "SETTLED"]).toContain(settlement.status);
  });
});

describe("Refund overdraw concurrency", () => {
  it("of two simultaneous refund requests that together exceed the remaining balance, total paid never exceeds Refund Due", async () => {
    const { moveOutId } = await setupCompletedMoveOut("SDC-REFUND", 8000, 8000);
    const { createSecurityDepositSettlement, submitSettlementForReview, reviewSettlement, approveSettlement, postSecurityDepositSettlement, recordSecurityDepositRefund } = await import(
      "@/lib/actions/security-deposits"
    );

    const settlementId = await createSecurityDepositSettlement(moveOutId);
    await submitSettlementForReview(settlementId);
    await reviewSettlement(settlementId, "FORWARD");
    await approveSettlement(settlementId);
    await postSecurityDepositSettlement(settlementId);
    // Refund Due = 8000 (no deductions). Two concurrent requests for 5000
    // each would total 10000 if both succeeded - they must not.

    const results = await Promise.allSettled([
      recordSecurityDepositRefund(fd({ settlementId, amount: "5000", method: "CASH" })),
      recordSecurityDepositRefund(fd({ settlementId, amount: "5000", method: "CASH" })),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBe(1);

    const refunds = await prisma.securityDepositRefund.findMany({ where: { settlementId, status: "PAID" } });
    const totalPaid = refunds.reduce((sum, r) => sum + Number(r.amount), 0);
    expect(totalPaid).toBe(5000);
    expect(totalPaid).toBeLessThanOrEqual(8000);
  });

  it("allows a second, smaller refund request for exactly the remaining balance, and blocks any further over-refund", async () => {
    const { moveOutId } = await setupCompletedMoveOut("SDC-PARTIAL-REFUND", 8000, 8000);
    const { createSecurityDepositSettlement, submitSettlementForReview, reviewSettlement, approveSettlement, postSecurityDepositSettlement, recordSecurityDepositRefund } = await import(
      "@/lib/actions/security-deposits"
    );
    const settlementId = await createSecurityDepositSettlement(moveOutId);
    await submitSettlementForReview(settlementId);
    await reviewSettlement(settlementId, "FORWARD");
    await approveSettlement(settlementId);
    await postSecurityDepositSettlement(settlementId);

    await recordSecurityDepositRefund(fd({ settlementId, amount: "3000", method: "CASH" }));
    let settlement = await prisma.securityDepositSettlement.findUniqueOrThrow({ where: { id: settlementId } });
    expect(settlement.status).toBe("PARTIALLY_SETTLED");

    await recordSecurityDepositRefund(fd({ settlementId, amount: "5000", method: "CASH" }));
    settlement = await prisma.securityDepositSettlement.findUniqueOrThrow({ where: { id: settlementId } });
    expect(settlement.status).toBe("SETTLED");

    await expect(recordSecurityDepositRefund(fd({ settlementId, amount: "0.01", method: "CASH" }))).rejects.toThrow();
    const refunds = await prisma.securityDepositRefund.findMany({ where: { settlementId, status: "PAID" } });
    const totalPaid = refunds.reduce((sum, r) => sum + Number(r.amount), 0);
    expect(totalPaid).toBe(8000);
  });
});
