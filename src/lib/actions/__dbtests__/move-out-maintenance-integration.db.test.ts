/**
 * Real, database-backed Maintenance integration test for Move-Out
 * Management (Move-Out Management Phase 2, requirement 10):
 * createMaintenanceRequestFromMoveOut() derives UNIT scope from the
 * Move-Out's own (Contract-derived) unitId - never trusted from the client
 * - records the moveOutId/moveOutInspectionItemId reference, never mutates
 * the Move-Out/inspection item, and never posts anything financial. Also
 * confirms Maintenance's own lifecycle/permissions/assignment are
 * unaffected (this integration is purely additive).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestContract, uniqueSuffix, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("MMR");
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

describe("createMaintenanceRequestFromMoveOut()", () => {
  it("derives UNIT scope from the Move-Out's own unitId, ignoring any client-supplied unitId/scopeType, and links source references without mutating the Move-Out", async () => {
    const { contract, unit } = await createTestContract(org, { unitNumber: `MMR-1-${Date.now()}` });
    const { createMoveOut, startMoveOut } = await import("@/lib/actions/move-outs");
    const moveOutId = await createMoveOut(formDataWith({ contractId: contract.id }));
    await startMoveOut(moveOutId);
    const item = await prisma.moveOutInspectionItem.findFirstOrThrow({ where: { moveOutId } });
    const moveOutBefore = await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } });
    const itemBefore = await prisma.moveOutInspectionItem.findUniqueOrThrow({ where: { id: item.id } });

    const { createMaintenanceRequestFromMoveOut } = await import("@/lib/actions/maintenance");
    const otherUnit = await prisma.unit.create({
      data: { organizationId: org.organization.id, floorId: org.floor.id, unitNumber: `MMR-SPOOF-${uniqueSuffix()}`, baseRentAmount: 1000 },
    });
    const requestId = await createMaintenanceRequestFromMoveOut(
      formDataWith({ moveOutId, inspectionItemId: item.id, unitId: otherUnit.id, scopeType: "BUILDING_COMMON_AREA", title: "Broken window" })
    );

    const request = await prisma.maintenanceRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request.scopeType).toBe("UNIT");
    expect(request.unitId).toBe(unit.id);
    expect(request.unitId).not.toBe(otherUnit.id);
    expect(request.moveOutId).toBe(moveOutId);
    expect(request.moveOutInspectionItemId).toBe(item.id);
    expect(request.source).toBe("MOVE_OUT_INSPECTION");
    expect(request.title).toBe("Broken window");

    // Never mutates the Move-Out/inspection item it was raised from.
    expect(await prisma.moveOut.findUniqueOrThrow({ where: { id: moveOutId } })).toEqual(moveOutBefore);
    expect(await prisma.moveOutInspectionItem.findUniqueOrThrow({ where: { id: item.id } })).toEqual(itemBefore);
  });

  it("defaults title/category from the inspection item when not supplied, exactly like createMaintenanceRequestFromMoveIn()", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `MMR-2-${Date.now()}` });
    const { createMoveOut, startMoveOut } = await import("@/lib/actions/move-outs");
    const moveOutId = await createMoveOut(formDataWith({ contractId: contract.id }));
    await startMoveOut(moveOutId);
    const item = await prisma.moveOutInspectionItem.findFirstOrThrow({ where: { moveOutId } });
    await prisma.moveOutInspectionItem.update({ where: { id: item.id }, data: { notes: "Scratched paint on the wall" } });

    const { createMaintenanceRequestFromMoveOut } = await import("@/lib/actions/maintenance");
    const requestId = await createMaintenanceRequestFromMoveOut(formDataWith({ moveOutId, inspectionItemId: item.id }));

    const request = await prisma.maintenanceRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request.title).toBe(item.itemName);
    expect(request.description).toBe("Scratched paint on the wall");
    expect(request.category).toBe("GENERAL");
    expect(request.priority).toBe("NORMAL");
  });

  it("creates no financial record and does not affect Maintenance's own permission/lifecycle behavior", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `MMR-3-${Date.now()}` });
    const { createMoveOut, startMoveOut } = await import("@/lib/actions/move-outs");
    const moveOutId = await createMoveOut(formDataWith({ contractId: contract.id }));
    await startMoveOut(moveOutId);
    const item = await prisma.moveOutInspectionItem.findFirstOrThrow({ where: { moveOutId } });

    const invoiceCountBefore = await prisma.invoice.count({ where: { organizationId: org.organization.id } });
    const paymentCountBefore = await prisma.payment.count({ where: { organizationId: org.organization.id } });

    const { createMaintenanceRequestFromMoveOut, triageMaintenanceRequest, createWorkOrderFromRequest } = await import("@/lib/actions/maintenance");
    const requestId = await createMaintenanceRequestFromMoveOut(formDataWith({ moveOutId, inspectionItemId: item.id }));
    // The resulting Request follows Maintenance's ordinary lifecycle unchanged.
    await triageMaintenanceRequest(requestId, formDataWith({}));
    const workOrderId = await createWorkOrderFromRequest(requestId, formDataWith({}));
    expect(await prisma.maintenanceWorkOrder.count({ where: { id: workOrderId, requestId } })).toBe(1);

    expect(await prisma.invoice.count({ where: { organizationId: org.organization.id } })).toBe(invoiceCountBefore);
    expect(await prisma.payment.count({ where: { organizationId: org.organization.id } })).toBe(paymentCountBefore);
  });
});
