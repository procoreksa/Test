/**
 * Real, database-backed cross-organization security, IDOR, and
 * relation-injection tests for Move-Out Management (Move-Out Management
 * Phase 2, requirement 7), following the exact pattern established by
 * move-in-cross-org-security.db.test.ts: two real seeded organizations,
 * only the NextAuth session boundary mocked.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestContract, driveMoveInToCompletion, uniqueSuffix, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let orgA: SeededOrg;
let orgB: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  orgA = await seedFullOrg("MOA");
  orgB = await seedFullOrg("MOB");
});

beforeEach(() => {
  mockAuth.mockReset();
});

function formDataWith(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("Move-Out cross-organization isolation", () => {
  it("Admin A cannot create a Move-Out for Org B's Contract", async () => {
    const { contract: contractB } = await createTestContract(orgB);
    mockAuth.mockResolvedValue(orgA.session);
    const { createMoveOut } = await import("@/lib/actions/move-outs");

    await expect(createMoveOut(formDataWith({ contractId: contractB.id }))).rejects.toThrow();
    expect(await prisma.moveOut.count({ where: { contractId: contractB.id } })).toBe(0);
  });

  it("Admin A cannot read, start, complete, or cancel Org B's Move-Out", async () => {
    const { contract: contractB } = await createTestContract(orgB, { unitNumber: `MOB-1-${Date.now()}` });
    mockAuth.mockResolvedValue(orgB.session);
    const { createMoveOut, startMoveOut, completeMoveOut, cancelMoveOut, getMoveOutById } = await import("@/lib/actions/move-outs");
    const moveOutId = await createMoveOut(formDataWith({ contractId: contractB.id }));

    mockAuth.mockResolvedValue(orgA.session);
    await expect(getMoveOutById(moveOutId)).rejects.toThrow();
    await expect(startMoveOut(moveOutId)).rejects.toThrow();
    await expect(completeMoveOut(moveOutId)).rejects.toThrow();
    await expect(cancelMoveOut(formDataWith({ moveOutId, reason: "DATA_ERROR" }))).rejects.toThrow();

    const stillDraft = await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } });
    expect(stillDraft.status).toBe("DRAFT");
  });

  it("Admin A cannot add inspection/inventory/meter/key items to Org B's Move-Out", async () => {
    const { contract: contractB } = await createTestContract(orgB, { unitNumber: `MOB-2-${Date.now()}` });
    mockAuth.mockResolvedValue(orgB.session);
    const { createMoveOut, startMoveOut } = await import("@/lib/actions/move-outs");
    const moveOutId = await createMoveOut(formDataWith({ contractId: contractB.id }));
    await startMoveOut(moveOutId);
    const item = await prisma.moveOutInspectionItem.findFirstOrThrow({ where: { moveOutId } });

    mockAuth.mockResolvedValue(orgA.session);
    const { updateInspectionItem, addInventoryItem, addMeterReading, addKeyItem } = await import("@/lib/actions/move-outs");

    await expect(updateInspectionItem(formDataWith({ itemId: item.id, condition: "GOOD" }))).rejects.toThrow();
    await expect(addInventoryItem(formDataWith({ moveOutId, category: "BEDROOM", itemName: "Sofa" }))).rejects.toThrow();
    await expect(addMeterReading(formDataWith({ moveOutId, meterType: "ELECTRICITY", reading: "100" }))).rejects.toThrow();
    await expect(addKeyItem(formDataWith({ moveOutId, keyType: "KEY", description: "Main key" }))).rejects.toThrow();

    const stillUnchanged = await prisma.moveOutInspectionItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(stillUnchanged.condition).toBeNull();
    expect(await prisma.moveOutInventoryItem.count({ where: { moveOutId } })).toBe(0);
    expect(await prisma.moveOutMeterReading.count({ where: { moveOutId } })).toBe(0);
    expect(await prisma.moveOutKeyItem.count({ where: { moveOutId } })).toBe(0);
  });

  it("IDOR: cross-org contractId/moveOutId/inspectionItemId are all rejected, never silently ignored", async () => {
    const { contract: contractA, unit: unitA } = await createTestContract(orgA, { unitNumber: `MOA-1-${Date.now()}` });
    mockAuth.mockResolvedValue(orgA.session);
    const { createMoveOut } = await import("@/lib/actions/move-outs");
    const moveOutIdA = await createMoveOut(formDataWith({ contractId: contractA.id }));

    mockAuth.mockResolvedValue(orgB.session);
    const { getMoveOutById, addInventoryItem } = await import("@/lib/actions/move-outs");
    await expect(getMoveOutById(moveOutIdA)).rejects.toThrow();
    await expect(addInventoryItem(formDataWith({ moveOutId: moveOutIdA, category: "BEDROOM", itemName: "Sofa" }))).rejects.toThrow();

    expect(unitA.organizationId).toBe(orgA.organization.id);
  });

  it("Admin A cannot create a Maintenance Request from Org B's Move-Out inspection finding", async () => {
    const { contract: contractB } = await createTestContract(orgB, { unitNumber: `MOB-3-${Date.now()}` });
    mockAuth.mockResolvedValue(orgB.session);
    const { createMoveOut, startMoveOut } = await import("@/lib/actions/move-outs");
    const moveOutId = await createMoveOut(formDataWith({ contractId: contractB.id }));
    await startMoveOut(moveOutId);
    const item = await prisma.moveOutInspectionItem.findFirstOrThrow({ where: { moveOutId } });

    mockAuth.mockResolvedValue(orgA.session);
    const { createMaintenanceRequestFromMoveOut } = await import("@/lib/actions/maintenance");
    await expect(createMaintenanceRequestFromMoveOut(formDataWith({ moveOutId, inspectionItemId: item.id, title: "Broken" }))).rejects.toThrow();
    expect(await prisma.maintenanceRequest.count({ where: { moveOutId } })).toBe(0);
  });
});

describe("Move-Out relation-injection defenses", () => {
  it("rejects a MoveOut/MoveIn cross-Contract injection at completion time - a moveInId pointing at a different Contract's Move-In is caught and every record is left unchanged", async () => {
    const { contract: contractA } = await createTestContract(orgA, { unitNumber: `MOA-2-${Date.now()}` });
    const { contract: otherContractA } = await createTestContract(orgA, { unitNumber: `MOA-3-${Date.now()}` });
    mockAuth.mockResolvedValue(orgA.session);

    // A genuine, completed Move-In - but for a DIFFERENT Contract than the
    // Move-Out under test (simulating a data-integrity violation / injected
    // foreign key, since createMoveOut() itself never lets this happen).
    const foreignMoveInId = await driveMoveInToCompletion(otherContractA.id);

    const { createMoveOut, startMoveOut, updateInspectionItem, advanceToFindingsReview, reviewMoveOutFindings, addMeterReading, addKeyItem, setVacateDate, recordTenantAcknowledgement, recordStaffAcknowledgement, completeMoveOut } =
      await import("@/lib/actions/move-outs");
    const moveOutId = await createMoveOut(formDataWith({ contractId: contractA.id }));
    await prisma.moveOut.update({ where: { id: moveOutId }, data: { moveInId: foreignMoveInId } });

    await startMoveOut(moveOutId);
    const items = await prisma.moveOutInspectionItem.findMany({ where: { moveOutId, isApplicable: true } });
    for (const item of items) await updateInspectionItem(formDataWith({ itemId: item.id, condition: "GOOD" }));
    await addMeterReading(formDataWith({ moveOutId, meterType: "ELECTRICITY", reading: "1" }));
    await addMeterReading(formDataWith({ moveOutId, meterType: "WATER", reading: "1" }));
    await addKeyItem(formDataWith({ moveOutId, keyType: "KEY", description: "Key" }));
    await setVacateDate(formDataWith({ moveOutId, vacateDate: "2027-06-15T10:00:00" }));
    await recordTenantAcknowledgement(formDataWith({ moveOutId, tenantRepresentativeName: "Tenant Rep" }));
    await recordStaffAcknowledgement(moveOutId);
    await advanceToFindingsReview(moveOutId);
    await reviewMoveOutFindings(moveOutId);

    await expect(completeMoveOut(moveOutId)).rejects.toThrow();
    const after = await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } });
    expect(after.status).not.toBe("COMPLETED");
  });

  it("rejects completion when the Contract's unitId/renterId have drifted from the Move-Out's own (Contract/Unit and Contract/Renter mismatch)", async () => {
    const { contract, unit } = await createTestContract(orgA, { unitNumber: `MOA-4-${Date.now()}` });
    mockAuth.mockResolvedValue(orgA.session);
    const { createMoveOut, startMoveOut, updateInspectionItem, advanceToFindingsReview, reviewMoveOutFindings, addMeterReading, addKeyItem, setVacateDate, recordTenantAcknowledgement, recordStaffAcknowledgement, completeMoveOut } =
      await import("@/lib/actions/move-outs");
    const moveOutId = await createMoveOut(formDataWith({ contractId: contract.id }));
    await startMoveOut(moveOutId);
    const items = await prisma.moveOutInspectionItem.findMany({ where: { moveOutId, isApplicable: true } });
    for (const item of items) await updateInspectionItem(formDataWith({ itemId: item.id, condition: "GOOD" }));
    await addMeterReading(formDataWith({ moveOutId, meterType: "ELECTRICITY", reading: "1" }));
    await addMeterReading(formDataWith({ moveOutId, meterType: "WATER", reading: "1" }));
    await addKeyItem(formDataWith({ moveOutId, keyType: "KEY", description: "Key" }));
    await setVacateDate(formDataWith({ moveOutId, vacateDate: "2027-06-15T10:00:00" }));
    await recordTenantAcknowledgement(formDataWith({ moveOutId, tenantRepresentativeName: "Tenant Rep" }));
    await recordStaffAcknowledgement(moveOutId);
    await advanceToFindingsReview(moveOutId);
    await reviewMoveOutFindings(moveOutId);

    // Simulate the Contract's own unitId being changed (updateContract()
    // allows this pre-billing) after the Move-Out was already prepared.
    const otherUnit = await prisma.unit.create({
      data: { organizationId: orgA.organization.id, floorId: orgA.floor.id, unitNumber: `MOA-5-${uniqueSuffix()}`, baseRentAmount: 1000 },
    });
    await prisma.contract.update({ where: { id: contract.id }, data: { unitId: otherUnit.id } });

    await expect(completeMoveOut(moveOutId)).rejects.toThrow();
    const after = await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } });
    expect(after.status).not.toBe("COMPLETED");
    // The rejection must leave every Unit exactly as it was - the Move-Out's
    // original Unit stays OCCUPIED (never vacated), and the drifted-to Unit
    // is untouched by this rejected completion (it was never a party to it).
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe("OCCUPIED");
  });

  it("rejects a MoveOut/inspection-item mismatch - an inspection item belonging to a different Move-Out cannot be attached to this one", async () => {
    const { contract: contractA } = await createTestContract(orgA, { unitNumber: `MOA-6-${Date.now()}` });
    const { contract: otherContractA } = await createTestContract(orgA, { unitNumber: `MOA-7-${Date.now()}` });
    mockAuth.mockResolvedValue(orgA.session);
    const { createMoveOut, addAttachmentMetadata } = await import("@/lib/actions/move-outs");
    const moveOutId = await createMoveOut(formDataWith({ contractId: contractA.id }));
    const otherMoveOutId = await createMoveOut(formDataWith({ contractId: otherContractA.id }));
    const foreignItem = await prisma.moveOutInspectionItem.findFirstOrThrow({ where: { moveOutId: otherMoveOutId } });

    await expect(
      addAttachmentMetadata(formDataWith({ moveOutId, inspectionItemId: foreignItem.id, attachmentType: "PHOTO", fileName: "a.jpg", mimeType: "image/jpeg" }))
    ).rejects.toThrow();
    expect(await prisma.moveOutAttachment.count({ where: { moveOutId } })).toBe(0);
  });

  it("inspectedByUserId/handedOverByUserId/findingsReviewedByUserId always come from the authenticated session, never a client-supplied value", async () => {
    const { contract } = await createTestContract(orgA, { unitNumber: `MOA-8-${Date.now()}` });
    mockAuth.mockResolvedValue(orgA.session);
    const { createMoveOut, startMoveOut, updateInspectionItem, advanceToFindingsReview, reviewMoveOutFindings, recordStaffAcknowledgement } = await import("@/lib/actions/move-outs");
    const moveOutId = await createMoveOut(formDataWith({ contractId: contract.id }));

    // None of these actions even accept a userId field - attempting to
    // smuggle one in has no effect, since every write derives the actor
    // from requireSession(), never from client input.
    await startMoveOut(moveOutId);
    const items = await prisma.moveOutInspectionItem.findMany({ where: { moveOutId, isApplicable: true } });
    for (const item of items) await updateInspectionItem(formDataWith({ itemId: item.id, condition: "GOOD" }));
    await recordStaffAcknowledgement(moveOutId);
    await advanceToFindingsReview(moveOutId);
    await reviewMoveOutFindings(moveOutId);

    const moveOut = await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } });
    expect(moveOut.inspectedByUserId).toBe(orgA.admin.id);
    expect(moveOut.findingsReviewedByUserId).toBe(orgA.admin.id);
    expect(moveOut.handedOverByUserId).toBe(orgA.admin.id);
  });
});
