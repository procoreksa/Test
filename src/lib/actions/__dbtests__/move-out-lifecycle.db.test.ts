/**
 * Real, database-backed lifecycle/regression tests for Move-Out Management
 * (docs/MOVE-OUT-MANAGEMENT.md): full happy-path flow (both ACTIVE- and
 * TERMINATED-Contract eligibility), idempotent completion, post-completion
 * immutability, findings-review reopen, cancellation, and the
 * terminateContract() Unit-vacancy regression (Decision 1).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestContract, driveMoveInToCompletion, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("MOL");
});

beforeEach(() => {
  mockAuth.mockReset();
  mockAuth.mockResolvedValue(org.session);
});

function formDataWith(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function driveMoveOutToReadyForClosure(contractId: string) {
  const { createMoveOut, startMoveOut, updateInspectionItem, addMeterReading, addKeyItem, advanceToFindingsReview, reviewMoveOutFindings, setVacateDate, recordTenantAcknowledgement, recordStaffAcknowledgement } =
    await import("@/lib/actions/move-outs");

  const moveOutId = await createMoveOut(formDataWith({ contractId }));
  await startMoveOut(moveOutId);
  const items = await prisma.moveOutInspectionItem.findMany({ where: { moveOutId, isApplicable: true } });
  for (const item of items) {
    await updateInspectionItem(formDataWith({ itemId: item.id, condition: "GOOD" }));
  }
  // Every editable-gated field must be recorded before findings review locks
  // the record into READY_FOR_CLOSURE (isMoveOutEditable() excludes it).
  await addMeterReading(formDataWith({ moveOutId, meterType: "ELECTRICITY", reading: "1200" }));
  await addMeterReading(formDataWith({ moveOutId, meterType: "WATER", reading: "600" }));
  await addKeyItem(formDataWith({ moveOutId, keyType: "KEY", description: "Main door key" }));
  await setVacateDate(formDataWith({ moveOutId, vacateDate: "2027-06-15T10:00:00" }));
  await recordTenantAcknowledgement(formDataWith({ moveOutId, tenantRepresentativeName: "Tenant Rep" }));
  await recordStaffAcknowledgement(moveOutId);
  await advanceToFindingsReview(moveOutId);
  await reviewMoveOutFindings(moveOutId);
  return moveOutId;
}

describe("Move-Out full lifecycle (ACTIVE contract, with a completed Move-In baseline)", () => {
  it("drives DRAFT -> IN_PROGRESS -> PENDING_FINDINGS_REVIEW -> READY_FOR_CLOSURE -> COMPLETED, vacating the Unit only at completion", async () => {
    const { contract, unit } = await createTestContract(org, { unitNumber: `MOL-1-${Date.now()}` });
    await driveMoveInToCompletion(contract.id);

    const {
      createMoveOut,
      startMoveOut,
      updateInspectionItem,
      addMeterReading,
      addKeyItem,
      setVacateDate,
      recordTenantAcknowledgement,
      recordStaffAcknowledgement,
      advanceToFindingsReview,
      reviewMoveOutFindings,
      completeMoveOut,
      getMoveOutById,
    } = await import("@/lib/actions/move-outs");

    const moveOutId = await createMoveOut(formDataWith({ contractId: contract.id }));
    const created = await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } });
    expect(created.status).toBe("DRAFT");
    // The completed Move-In is auto-linked as the baseline, never client-supplied.
    expect(created.moveInId).not.toBeNull();

    await startMoveOut(moveOutId);
    expect((await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } })).status).toBe("IN_PROGRESS");

    const items = await prisma.moveOutInspectionItem.findMany({ where: { moveOutId, isApplicable: true } });
    expect(items.length).toBeGreaterThan(0);
    // Each item was seeded linked to its Move-In counterpart.
    expect(items.every((i) => i.moveInInspectionItemId !== null)).toBe(true);
    for (const item of items) {
      await updateInspectionItem(formDataWith({ itemId: item.id, condition: "GOOD" }));
    }

    // Every editable-gated field must be recorded before findings review
    // locks the record into READY_FOR_CLOSURE.
    await addMeterReading(formDataWith({ moveOutId, meterType: "ELECTRICITY", reading: "1200" }));
    await addMeterReading(formDataWith({ moveOutId, meterType: "WATER", reading: "600" }));
    await addKeyItem(formDataWith({ moveOutId, keyType: "KEY", description: "Main door key" }));
    await setVacateDate(formDataWith({ moveOutId, vacateDate: "2027-06-15T10:00:00" }));
    await recordTenantAcknowledgement(formDataWith({ moveOutId, tenantRepresentativeName: "Tenant Rep" }));
    await recordStaffAcknowledgement(moveOutId);

    await advanceToFindingsReview(moveOutId);
    expect((await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } })).status).toBe("PENDING_FINDINGS_REVIEW");

    await reviewMoveOutFindings(moveOutId);
    const afterReview = await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } });
    expect(afterReview.status).toBe("READY_FOR_CLOSURE");
    expect(afterReview.findingsReviewedAt).not.toBeNull();
    expect(afterReview.findingsReviewedByUserId).toBe(org.admin.id);

    const { completion, keyReconciliation } = await getMoveOutById(moveOutId);
    expect(completion.canComplete).toBe(true);
    expect(keyReconciliation.allReturned).toBe(true);

    const resultId = await completeMoveOut(moveOutId);
    expect(resultId).toBe(moveOutId);

    const completed = await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } });
    expect(completed.status).toBe("COMPLETED");
    expect(completed.completedAt).not.toBeNull();

    // Decision 1: the completed Move-Out is the sole trigger for VACANT.
    const unitAfter = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    expect(unitAfter.status).toBe("VACANT");

    // Decision 2: Move-Out never touches Contract.
    const contractAfter = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    expect(contractAfter.status).toBe("ACTIVE");
  });

  it("completeMoveOut() is idempotent - a second call returns the same id without duplicating audit rows or re-writing Unit.status", async () => {
    const { contract, unit } = await createTestContract(org, { unitNumber: `MOL-2-${Date.now()}` });
    const moveOutId = await driveMoveOutToReadyForClosure(contract.id);
    const { completeMoveOut } = await import("@/lib/actions/move-outs");

    const firstResult = await completeMoveOut(moveOutId);
    const auditCountAfterFirst = await prisma.auditLog.count({ where: { entityType: "MoveOut", entityId: moveOutId, action: "UPDATE" } });
    const unitAfterFirst = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });

    const secondResult = await completeMoveOut(moveOutId);
    const auditCountAfterSecond = await prisma.auditLog.count({ where: { entityType: "MoveOut", entityId: moveOutId, action: "UPDATE" } });
    const unitAfterSecond = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });

    expect(secondResult).toBe(firstResult);
    expect(auditCountAfterSecond).toBe(auditCountAfterFirst);
    expect(unitAfterSecond.updatedAt.getTime()).toBe(unitAfterFirst.updatedAt.getTime());
  });

  it("post-completion: inspection items, meters, keys become read-only", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `MOL-3-${Date.now()}` });
    const moveOutId = await driveMoveOutToReadyForClosure(contract.id);
    const { completeMoveOut, updateInspectionItem, addMeterReading, addKeyItem } = await import("@/lib/actions/move-outs");
    await completeMoveOut(moveOutId);

    const item = await prisma.moveOutInspectionItem.findFirstOrThrow({ where: { moveOutId } });
    await expect(updateInspectionItem(formDataWith({ itemId: item.id, condition: "DAMAGED" }))).rejects.toThrow();
    await expect(addMeterReading(formDataWith({ moveOutId, meterType: "GAS", reading: "1" }))).rejects.toThrow();
    await expect(addKeyItem(formDataWith({ moveOutId, keyType: "REMOTE", description: "Extra remote" }))).rejects.toThrow();

    const unchanged = await prisma.moveOutInspectionItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(unchanged.condition).toBe("GOOD");
  });

  it("rejects completion when required requirements are missing, listing them, and leaves the record unchanged", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `MOL-4-${Date.now()}` });
    const { createMoveOut, startMoveOut, completeMoveOut } = await import("@/lib/actions/move-outs");
    const moveOutId = await createMoveOut(formDataWith({ contractId: contract.id }));
    await startMoveOut(moveOutId);

    await expect(completeMoveOut(moveOutId)).rejects.toThrow();
    const stillInProgress = await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } });
    expect(stillInProgress.status).toBe("IN_PROGRESS");
  });

  it("reopenMoveOutStage() steps back one stage and clears the findings-review stamp when leaving READY_FOR_CLOSURE", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `MOL-5-${Date.now()}` });
    const { createMoveOut, startMoveOut, updateInspectionItem, advanceToFindingsReview, reviewMoveOutFindings, reopenMoveOutStage } = await import("@/lib/actions/move-outs");
    const moveOutId = await createMoveOut(formDataWith({ contractId: contract.id }));
    await startMoveOut(moveOutId);
    const items = await prisma.moveOutInspectionItem.findMany({ where: { moveOutId, isApplicable: true } });
    for (const item of items) {
      await updateInspectionItem(formDataWith({ itemId: item.id, condition: "GOOD" }));
    }
    await advanceToFindingsReview(moveOutId);
    await reviewMoveOutFindings(moveOutId);
    expect((await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } })).status).toBe("READY_FOR_CLOSURE");

    await reopenMoveOutStage(moveOutId);
    const backToReview = await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } });
    expect(backToReview.status).toBe("PENDING_FINDINGS_REVIEW");
    expect(backToReview.findingsReviewedAt).toBeNull();
    expect(backToReview.findingsReviewedByUserId).toBeNull();

    await reopenMoveOutStage(moveOutId);
    expect((await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } })).status).toBe("IN_PROGRESS");
  });

  it("cancellation never deletes the record and requires a note for OTHER", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `MOL-6-${Date.now()}` });
    const { createMoveOut, cancelMoveOut } = await import("@/lib/actions/move-outs");
    const moveOutId = await createMoveOut(formDataWith({ contractId: contract.id }));

    await expect(cancelMoveOut(formDataWith({ moveOutId, reason: "OTHER" }))).rejects.toThrow();
    await cancelMoveOut(formDataWith({ moveOutId, reason: "OTHER", note: "Wrong unit selected" }));

    const cancelled = await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelReasonNote).toBe("Wrong unit selected");
  });
});

describe("Move-Out eligibility for a TERMINATED contract", () => {
  it("allows creating and completing a Move-Out for a TERMINATED contract, and vacates its Unit", async () => {
    const { contract, unit } = await createTestContract(org, { unitNumber: `MOL-7-${Date.now()}` });
    const { terminateContract } = await import("@/lib/actions/contracts");
    await terminateContract(contract.id);
    expect((await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } })).status).toBe("TERMINATED");
    // Regression (Decision 1): termination alone must NOT vacate the Unit.
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe("OCCUPIED");

    const moveOutId = await driveMoveOutToReadyForClosure(contract.id);
    const { completeMoveOut } = await import("@/lib/actions/move-outs");
    await completeMoveOut(moveOutId);

    expect((await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe("VACANT");
  });

  it("rejects creating a Move-Out for a DRAFT or RENEWED contract", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `MOL-8-${Date.now()}` });
    await prisma.contract.update({ where: { id: contract.id }, data: { status: "DRAFT" } });
    const { createMoveOut } = await import("@/lib/actions/move-outs");
    await expect(createMoveOut(formDataWith({ contractId: contract.id }))).rejects.toThrow();

    await prisma.contract.update({ where: { id: contract.id }, data: { status: "RENEWED" } });
    await expect(createMoveOut(formDataWith({ contractId: contract.id }))).rejects.toThrow();
    expect(await prisma.moveOut.count({ where: { contractId: contract.id } })).toBe(0);
  });
});

describe("terminateContract() Unit-vacancy regression (Decision 1)", () => {
  it("terminating a Contract with no Move-Out leaves the Unit OCCUPIED, but still cancels pending PaymentSchedules", async () => {
    const { contract, unit } = await createTestContract(org, { unitNumber: `MOL-9-${Date.now()}` });
    const pendingBefore = await prisma.paymentSchedule.count({ where: { contractId: contract.id, status: "PENDING" } });
    expect(pendingBefore).toBeGreaterThan(0);

    const { terminateContract } = await import("@/lib/actions/contracts");
    await terminateContract(contract.id);

    expect((await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe("OCCUPIED");
    expect((await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } })).status).toBe("TERMINATED");
    const pendingAfter = await prisma.paymentSchedule.count({ where: { contractId: contract.id, status: "PENDING" } });
    expect(pendingAfter).toBe(0);
    const cancelledAfter = await prisma.paymentSchedule.count({ where: { contractId: contract.id, status: "CANCELLED" } });
    expect(cancelledAfter).toBe(pendingBefore);
  });
});
