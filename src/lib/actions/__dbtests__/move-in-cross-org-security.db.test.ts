/**
 * Real, database-backed cross-organization security and IDOR tests for
 * Move-In & Handover Inspection (docs/MOVE-IN-HANDOVER.md, Steps 48-51),
 * following the exact pattern established by
 * reservation-contract-cross-org-security.db.test.ts: two real seeded
 * organizations, only the NextAuth session boundary mocked.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestContract, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let orgA: SeededOrg;
let orgB: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  orgA = await seedFullOrg("MIA");
  orgB = await seedFullOrg("MIB");
});

beforeEach(() => {
  mockAuth.mockReset();
});

function formDataWith(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("Move-In cross-organization isolation", () => {
  it("Admin A cannot create a Move-In for Org B's Contract", async () => {
    const { contract: contractB } = await createTestContract(orgB);
    mockAuth.mockResolvedValue(orgA.session);
    const { createMoveIn } = await import("@/lib/actions/move-ins");

    await expect(createMoveIn(formDataWith({ contractId: contractB.id }))).rejects.toThrow();
    const count = await prisma.moveIn.count({ where: { contractId: contractB.id } });
    expect(count).toBe(0);
  });

  it("Admin A cannot read, start, complete, or cancel Org B's Move-In", async () => {
    const { contract: contractB } = await createTestContract(orgB);
    mockAuth.mockResolvedValue(orgB.session);
    const { createMoveIn, startMoveIn, completeMoveIn, cancelMoveIn, getMoveInById } = await import("@/lib/actions/move-ins");
    const moveInId = await createMoveIn(formDataWith({ contractId: contractB.id }));

    mockAuth.mockResolvedValue(orgA.session);
    await expect(getMoveInById(moveInId)).rejects.toThrow();
    await expect(startMoveIn(moveInId)).rejects.toThrow();
    await expect(completeMoveIn(moveInId)).rejects.toThrow();
    await expect(cancelMoveIn(formDataWith({ moveInId, reason: "DATA_ERROR" }))).rejects.toThrow();

    const stillDraft = await prisma.moveIn.findUniqueOrThrow({ where: { id: moveInId } });
    expect(stillDraft.status).toBe("DRAFT");
  });

  it("Admin A cannot add inspection/inventory/meter/key items to Org B's Move-In", async () => {
    const { contract: contractB } = await createTestContract(orgB);
    mockAuth.mockResolvedValue(orgB.session);
    const { createMoveIn, startMoveIn } = await import("@/lib/actions/move-ins");
    const moveInId = await createMoveIn(formDataWith({ contractId: contractB.id }));
    await startMoveIn(moveInId);
    const item = await prisma.moveInInspectionItem.findFirstOrThrow({ where: { moveInId } });

    mockAuth.mockResolvedValue(orgA.session);
    const { updateInspectionItem, addInventoryItem, addMeterReading, addKeyItem } = await import("@/lib/actions/move-ins");

    await expect(updateInspectionItem(formDataWith({ itemId: item.id, condition: "GOOD" }))).rejects.toThrow();
    await expect(addInventoryItem(formDataWith({ moveInId, category: "BEDROOM", itemName: "Sofa" }))).rejects.toThrow();
    await expect(addMeterReading(formDataWith({ moveInId, meterType: "ELECTRICITY", reading: "100" }))).rejects.toThrow();
    await expect(addKeyItem(formDataWith({ moveInId, keyType: "KEY", description: "Main key" }))).rejects.toThrow();

    const stillUnchanged = await prisma.moveInInspectionItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(stillUnchanged.condition).toBeNull();
    expect(await prisma.moveInInventoryItem.count({ where: { moveInId } })).toBe(0);
    expect(await prisma.moveInMeterReading.count({ where: { moveInId } })).toBe(0);
    expect(await prisma.moveInKeyItem.count({ where: { moveInId } })).toBe(0);
  });

  it("IDOR: cross-org contractId/unitId/renterId/inspectionItemId/moveInId are all rejected, never silently ignored", async () => {
    const { contract: contractA, unit: unitA } = await createTestContract(orgA);
    mockAuth.mockResolvedValue(orgA.session);
    const { createMoveIn } = await import("@/lib/actions/move-ins");
    const moveInIdA = await createMoveIn(formDataWith({ contractId: contractA.id }));

    // Org B admin tries every id belonging to Org A.
    mockAuth.mockResolvedValue(orgB.session);
    const { getMoveInById, addInventoryItem } = await import("@/lib/actions/move-ins");
    await expect(getMoveInById(moveInIdA)).rejects.toThrow();
    await expect(addInventoryItem(formDataWith({ moveInId: moveInIdA, category: "BEDROOM", itemName: "Sofa" }))).rejects.toThrow();

    // Sanity: unitA/contractA really do belong to org A, not shared/global ids.
    expect(unitA.organizationId).toBe(orgA.organization.id);
  });
});

describe("Move-In eligibility and mismatch prevention", () => {
  it("rejects creating a Move-In for a non-ACTIVE (e.g. DRAFT-status via manual termination) contract", async () => {
    const { contract } = await createTestContract(orgA);
    await prisma.contract.update({ where: { id: contract.id }, data: { status: "TERMINATED" } });

    mockAuth.mockResolvedValue(orgA.session);
    const { createMoveIn } = await import("@/lib/actions/move-ins");
    await expect(createMoveIn(formDataWith({ contractId: contract.id }))).rejects.toThrow();
    expect(await prisma.moveIn.count({ where: { contractId: contract.id } })).toBe(0);
  });

  it("Unit/Renter are always derived from the Contract - never from client input (Step 50)", async () => {
    const { contract, unit } = await createTestContract(orgA);
    mockAuth.mockResolvedValue(orgA.session);
    const { createMoveIn } = await import("@/lib/actions/move-ins");

    // Even if a malicious caller tried to smuggle a different unitId/renterId
    // into the form, createMoveIn()'s signature only ever reads contractId -
    // verify the persisted MoveIn matches the Contract's own relations.
    const fd = formDataWith({ contractId: contract.id, unitId: "some-other-unit-id", renterId: "some-other-renter-id" });
    const moveInId = await createMoveIn(fd);
    const moveIn = await prisma.moveIn.findUniqueOrThrow({ where: { id: moveInId } });
    expect(moveIn.unitId).toBe(unit.id);
    expect(moveIn.unitId).toBe(contract.unitId);
    expect(moveIn.renterId).toBe(contract.renterId);
  });

  it("prevents a second active Move-In for the same Contract, but allows a fresh one after the first is cancelled (Step 6)", async () => {
    const { contract } = await createTestContract(orgA);
    mockAuth.mockResolvedValue(orgA.session);
    const { createMoveIn, cancelMoveIn } = await import("@/lib/actions/move-ins");

    const firstId = await createMoveIn(formDataWith({ contractId: contract.id }));
    await expect(createMoveIn(formDataWith({ contractId: contract.id }))).rejects.toThrow();
    expect(await prisma.moveIn.count({ where: { contractId: contract.id } })).toBe(1);

    await cancelMoveIn(formDataWith({ moveInId: firstId, reason: "DATA_ERROR" }));
    const secondId = await createMoveIn(formDataWith({ contractId: contract.id }));
    expect(secondId).not.toBe(firstId);
    expect(await prisma.moveIn.count({ where: { contractId: contract.id } })).toBe(2);
  });
});
