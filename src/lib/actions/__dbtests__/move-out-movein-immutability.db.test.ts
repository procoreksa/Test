/**
 * Real, database-backed Move-In immutability regression test (Move-Out
 * Management Phase 2, requirement 8): Move-Out may READ a Move-In and every
 * one of its child tables (inspection items, inventory items, meter
 * readings, key items) as read-only historical baseline data, but must
 * NEVER write back to any MoveIn* table. Snapshot-before / byte-for-byte
 * -after across the full Move-Out lifecycle, including the maintenance
 * integration path.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestContract, driveMoveInToCompletion, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("MMI");
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

async function snapshotMoveIn(moveInId: string) {
  const [moveIn, inspectionItems, inventoryItems, meterReadings, keyItems] = await Promise.all([
    prisma.moveIn.findUniqueOrThrow({ where: { id: moveInId } }),
    prisma.moveInInspectionItem.findMany({ where: { moveInId }, orderBy: { id: "asc" } }),
    prisma.moveInInventoryItem.findMany({ where: { moveInId }, orderBy: { id: "asc" } }),
    prisma.moveInMeterReading.findMany({ where: { moveInId }, orderBy: { id: "asc" } }),
    prisma.moveInKeyItem.findMany({ where: { moveInId }, orderBy: { id: "asc" } }),
  ]);
  return { moveIn, inspectionItems, inventoryItems, meterReadings, keyItems };
}

describe("Move-In immutability across the full Move-Out lifecycle", () => {
  it("every MoveIn* table is byte-for-byte identical after a full Move-Out create -> complete cycle, including a Maintenance Request raised from a finding", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `MMI-1-${Date.now()}` });
    const moveInId = await driveMoveInToCompletion(contract.id);
    await prisma.moveInInventoryItem.create({ data: { organizationId: org.organization.id, moveInId, category: "BEDROOM", itemName: "Wardrobe", quantity: 1, condition: "GOOD" } });

    const before = await snapshotMoveIn(moveInId);

    const {
      createMoveOut,
      startMoveOut,
      updateInspectionItem,
      addInventoryItem,
      advanceToFindingsReview,
      reviewMoveOutFindings,
      addMeterReading,
      addKeyItem,
      setVacateDate,
      recordTenantAcknowledgement,
      recordStaffAcknowledgement,
      completeMoveOut,
    } = await import("@/lib/actions/move-outs");

    const moveOutId = await createMoveOut(formDataWith({ contractId: contract.id }));
    expect((await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } })).moveInId).toBe(moveInId);

    await startMoveOut(moveOutId);
    const items = await prisma.moveOutInspectionItem.findMany({ where: { moveOutId, isApplicable: true } });
    for (const item of items) await updateInspectionItem(formDataWith({ itemId: item.id, condition: item === items[0] ? "DAMAGED" : "GOOD" }));
    await addInventoryItem(formDataWith({ moveOutId, category: "BEDROOM", itemName: "Wardrobe", quantity: "1", condition: "FAIR" }));

    // Raise a Maintenance Request from the one damaged finding.
    const { createMaintenanceRequestFromMoveOut } = await import("@/lib/actions/maintenance");
    const damagedItem = await prisma.moveOutInspectionItem.findFirstOrThrow({ where: { moveOutId, condition: "DAMAGED" } });
    await createMaintenanceRequestFromMoveOut(formDataWith({ moveOutId, inspectionItemId: damagedItem.id, title: "Damaged item" }));

    await addMeterReading(formDataWith({ moveOutId, meterType: "ELECTRICITY", reading: "1200" }));
    await addMeterReading(formDataWith({ moveOutId, meterType: "WATER", reading: "600" }));
    await addKeyItem(formDataWith({ moveOutId, keyType: "KEY", description: "Main door key" }));
    await setVacateDate(formDataWith({ moveOutId, vacateDate: "2027-06-15T10:00:00" }));
    await recordTenantAcknowledgement(formDataWith({ moveOutId, tenantRepresentativeName: "Tenant Rep" }));
    await recordStaffAcknowledgement(moveOutId);
    await advanceToFindingsReview(moveOutId);
    await reviewMoveOutFindings(moveOutId);
    await completeMoveOut(moveOutId);

    expect((await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } })).status).toBe("COMPLETED");
    expect(await prisma.maintenanceRequest.count({ where: { moveOutId, moveOutInspectionItemId: damagedItem.id } })).toBe(1);

    const after = await snapshotMoveIn(moveInId);
    expect(after).toEqual(before);
  });
});
