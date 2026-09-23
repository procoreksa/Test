/**
 * Real, database-backed concurrency tests for Move-Out Management (Move-Out
 * Management Phase 2, requirement 12): duplicate Move-Out creation for the
 * same Contract, a double-completion race on the same Move-Out, and a
 * Move-Out-creation-vs-renewal race - all using genuinely concurrent
 * Promise.allSettled() calls, no sleeps, mirroring the same
 * Serializable-transaction protection strategy already established by
 * reservation-contract-concurrency.db.test.ts / maintenance-concurrency.db.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestContract, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeEach(async () => {
  await resetDatabase();
  org = await seedFullOrg("MOC");
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

describe("Move-Out creation concurrency (requirement 5/12)", () => {
  it("of two simultaneous Move-Out creation attempts for the same Contract, exactly one Move-Out results", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `MOC-1-${Date.now()}` });
    const { createMoveOut } = await import("@/lib/actions/move-outs");

    const results = await Promise.allSettled([createMoveOut(formDataWith({ contractId: contract.id })), createMoveOut(formDataWith({ contractId: contract.id }))]);

    const fulfilled = results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled");
    expect(fulfilled.length).toBe(1);

    const moveOuts = await prisma.moveOut.findMany({ where: { contractId: contract.id } });
    expect(moveOuts).toHaveLength(1);
  });

  it("never issues the same Move-Out number twice under concurrent creation across different Contracts", async () => {
    const { contract: contractA } = await createTestContract(org, { unitNumber: `MOC-2A-${Date.now()}` });
    const { contract: contractB } = await createTestContract(org, { unitNumber: `MOC-2B-${Date.now()}` });
    const { createMoveOut } = await import("@/lib/actions/move-outs");

    const results = await Promise.allSettled([createMoveOut(formDataWith({ contractId: contractA.id })), createMoveOut(formDataWith({ contractId: contractB.id }))]);
    const fulfilled = results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const moveOuts = await prisma.moveOut.findMany({ where: { id: { in: fulfilled.map((r) => r.value) } }, select: { moveOutNumber: true } });
    const numbers = moveOuts.map((m) => m.moveOutNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});

describe("Move-Out completion concurrency (requirement 3/12)", () => {
  it("of two simultaneous completeMoveOut() calls on the same Move-Out, the Unit is vacated exactly once and no duplicate audit entry results", async () => {
    const { contract, unit } = await createTestContract(org, { unitNumber: `MOC-3-${Date.now()}` });
    const moveOutId = await driveMoveOutToReadyForClosure(contract.id);
    const { completeMoveOut } = await import("@/lib/actions/move-outs");

    const results = await Promise.allSettled([completeMoveOut(moveOutId), completeMoveOut(moveOutId)]);
    const fulfilled = results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    if (fulfilled.length === 2) {
      expect(fulfilled[0].value).toBe(fulfilled[1].value);
    }

    const completed = await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } });
    expect(completed.status).toBe("COMPLETED");
    const unitAfter = await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } });
    expect(unitAfter.status).toBe("VACANT");

    const completedAudits = await prisma.auditLog.findMany({ where: { organizationId: org.organization.id, entityType: "MoveOut", entityId: moveOutId, action: "UPDATE" } });
    const toCompletedAudits = completedAudits.filter((a) => (a.newValues as { status?: string } | null)?.status === "COMPLETED");
    expect(toCompletedAudits).toHaveLength(1);
  });
});

describe("Move-Out vs Contract renewal concurrency (requirement 4/12)", () => {
  it("of a simultaneous Move-Out creation and a Contract renewal for the same Contract, at most one of them succeeds - never both", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `MOC-4-${Date.now()}` });
    const { createMoveOut } = await import("@/lib/actions/move-outs");
    const { renewContract } = await import("@/lib/actions/contracts");

    const renewFd = formDataWith({
      contractId: contract.id,
      startDate: "2028-01-01",
      endDate: "2029-01-01",
      rentAmount: "13000",
      paymentFrequency: "ANNUAL",
      extraChargesMode: "ONE_TIME",
    });

    const results = await Promise.allSettled([createMoveOut(formDataWith({ contractId: contract.id })), renewContract(renewFd)]);

    const moveOutSucceeded = results[0].status === "fulfilled";
    const contractAfter = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
    const renewalSucceeded = contractAfter.status === "RENEWED";

    // Never both: a live Move-Out and a completed renewal for the same
    // Contract are mutually exclusive outcomes (requirement 4).
    expect(moveOutSucceeded && renewalSucceeded).toBe(false);

    if (renewalSucceeded) {
      expect(await prisma.moveOut.count({ where: { contractId: contract.id } })).toBe(0);
    }
    if (moveOutSucceeded) {
      expect(contractAfter.status).not.toBe("RENEWED");
      expect(await prisma.moveOut.count({ where: { contractId: contract.id } })).toBe(1);
    }
  });
});
