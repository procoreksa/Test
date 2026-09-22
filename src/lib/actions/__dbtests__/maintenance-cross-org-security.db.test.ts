/**
 * Real, database-backed cross-organization security, IDOR, and
 * relation-injection tests for Maintenance Management
 * (docs/MAINTENANCE-MANAGEMENT.md, Steps 82-84): two real seeded
 * organizations, only the NextAuth session boundary mocked - the exact
 * pattern established by move-in-cross-org-security.db.test.ts.
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
  orgA = await seedFullOrg("MXA");
  orgB = await seedFullOrg("MXB");
});

beforeEach(() => {
  mockAuth.mockReset();
});

function formDataWith(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function seedRequestAndWorkOrder(org: SeededOrg) {
  mockAuth.mockResolvedValue(org.session);
  const { createMaintenanceRequest, triageMaintenanceRequest, createWorkOrderFromRequest } = await import("@/lib/actions/maintenance");
  const requestId = await createMaintenanceRequest(formDataWith({ scopeType: "UNIT", unitId: org.unit.id, category: "GENERAL", title: "Fixture", reportedByType: "STAFF" }));
  await triageMaintenanceRequest(requestId, formDataWith({}));
  const workOrderId = await createWorkOrderFromRequest(requestId, formDataWith({}));
  return { requestId, workOrderId };
}

describe("Maintenance cross-organization isolation - Requests", () => {
  it("Admin A cannot create a Maintenance Request for Org B's Unit", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createMaintenanceRequest } = await import("@/lib/actions/maintenance");

    await expect(
      createMaintenanceRequest(formDataWith({ scopeType: "UNIT", unitId: orgB.unit.id, category: "GENERAL", title: "Cross-org attempt", reportedByType: "STAFF" }))
    ).rejects.toThrow();
    expect(await prisma.maintenanceRequest.count({ where: { unitId: orgB.unit.id } })).toBe(0);
  });

  it("Admin A cannot read, triage, or cancel Org B's Maintenance Request", async () => {
    const { requestId } = await seedRequestAndWorkOrder(orgB);

    mockAuth.mockResolvedValue(orgA.session);
    const { getMaintenanceRequestById, triageMaintenanceRequest, cancelMaintenanceRequest } = await import("@/lib/actions/maintenance");

    await expect(getMaintenanceRequestById(requestId)).rejects.toThrow();
    await expect(triageMaintenanceRequest(requestId, formDataWith({ triageNotes: "hacked" }))).rejects.toThrow();
    await expect(cancelMaintenanceRequest(requestId, formDataWith({ cancelReason: "OTHER", cancelReasonNote: "hacked" }))).rejects.toThrow();

    const stillOrgBsRequest = await prisma.maintenanceRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(stillOrgBsRequest.organizationId).toBe(orgB.organization.id);
    expect(stillOrgBsRequest.status).toBe("WORK_ORDER_CREATED");
  });
});

describe("Maintenance cross-organization isolation - Work Orders", () => {
  it("Admin A cannot create a Work Order from Org B's Request", async () => {
    const { requestId } = await seedRequestAndWorkOrder(orgB);
    // requestId here is already WORK_ORDER_CREATED, so use a fresh TRIAGED request instead.
    mockAuth.mockResolvedValue(orgB.session);
    const { createMaintenanceRequest, triageMaintenanceRequest } = await import("@/lib/actions/maintenance");
    const requestId2 = await createMaintenanceRequest(formDataWith({ scopeType: "UNIT", unitId: orgB.unit.id, category: "GENERAL", title: "Second", reportedByType: "STAFF" }));
    await triageMaintenanceRequest(requestId2, formDataWith({}));

    mockAuth.mockResolvedValue(orgA.session);
    const { createWorkOrderFromRequest } = await import("@/lib/actions/maintenance");
    await expect(createWorkOrderFromRequest(requestId2, formDataWith({}))).rejects.toThrow();
    expect(await prisma.maintenanceWorkOrder.count({ where: { requestId: requestId2 } })).toBe(0);
    void requestId;
  });

  it("Admin A cannot read, assign, schedule, start, complete, verify, or close Org B's Work Order", async () => {
    const { workOrderId } = await seedRequestAndWorkOrder(orgB);

    mockAuth.mockResolvedValue(orgA.session);
    const { getMaintenanceWorkOrderById, assignWorkOrder, scheduleWorkOrder, startWorkOrder, completeWorkOrder, verifyWorkOrder, closeWorkOrder } = await import("@/lib/actions/maintenance");

    await expect(getMaintenanceWorkOrderById(workOrderId)).rejects.toThrow();
    await expect(assignWorkOrder(workOrderId, formDataWith({ assignedToUserId: orgA.admin.id }))).rejects.toThrow();
    await expect(scheduleWorkOrder(workOrderId, formDataWith({ scheduledStart: "2027-01-01T09:00", scheduledEnd: "2027-01-01T10:00" }))).rejects.toThrow();
    await expect(startWorkOrder(workOrderId)).rejects.toThrow();
    await expect(completeWorkOrder(workOrderId, formDataWith({ workPerformed: "x", completionNotes: "y" }))).rejects.toThrow();
    await expect(verifyWorkOrder(workOrderId, formDataWith({}))).rejects.toThrow();
    await expect(closeWorkOrder(workOrderId)).rejects.toThrow();

    const stillDraft = await prisma.maintenanceWorkOrder.findUniqueOrThrow({ where: { id: workOrderId } });
    expect(stillDraft.status).toBe("DRAFT");
    expect(stillDraft.assignedToUserId).toBeNull();
  });

  it("Admin A cannot assign Org B's Work Order to Org A's own internal user (IDOR on assignedToUserId is blocked by the org-scoped Work Order lookup itself)", async () => {
    const { workOrderId } = await seedRequestAndWorkOrder(orgB);
    mockAuth.mockResolvedValue(orgA.session);
    const { assignWorkOrder } = await import("@/lib/actions/maintenance");
    await expect(assignWorkOrder(workOrderId, formDataWith({ assignedToUserId: orgA.admin.id }))).rejects.toThrow();
  });

  it("Admin A cannot assign Org A's own Work Order to Org B's internal user (cross-org assignedToUserId injection)", async () => {
    const { workOrderId } = await seedRequestAndWorkOrder(orgA);
    mockAuth.mockResolvedValue(orgA.session);
    const { assignWorkOrder } = await import("@/lib/actions/maintenance");
    await expect(assignWorkOrder(workOrderId, formDataWith({ assignedToUserId: orgB.admin.id }))).rejects.toThrow();
    const workOrder = await prisma.maintenanceWorkOrder.findUniqueOrThrow({ where: { id: workOrderId } });
    expect(workOrder.assignedToUserId).toBeNull();
  });

  it("Admin A cannot add Labor/Parts/Cost entries or Work Logs to Org B's Work Order", async () => {
    const { workOrderId } = await seedRequestAndWorkOrder(orgB);
    mockAuth.mockResolvedValue(orgA.session);
    const { addLaborEntry, addPartEntry, addCostEntry, addWorkLog } = await import("@/lib/actions/maintenance");

    await expect(addLaborEntry(workOrderId, formDataWith({ description: "x", hours: "1", workDate: "2027-01-01", cost: "10" }))).rejects.toThrow();
    await expect(addPartEntry(workOrderId, formDataWith({ itemName: "x", quantity: "1", unitCost: "10" }))).rejects.toThrow();
    await expect(addCostEntry(workOrderId, formDataWith({ costType: "OTHER", description: "x", amount: "10", date: "2027-01-01" }))).rejects.toThrow();
    await expect(addWorkLog(workOrderId, formDataWith({ note: "x" }))).rejects.toThrow();

    expect(await prisma.maintenanceLaborEntry.count({ where: { workOrderId } })).toBe(0);
    expect(await prisma.maintenancePartEntry.count({ where: { workOrderId } })).toBe(0);
    expect(await prisma.maintenanceCostEntry.count({ where: { workOrderId } })).toBe(0);
    expect(await prisma.maintenanceWorkLog.count({ where: { workOrderId } })).toBe(0);
  });
});

describe("Maintenance cross-organization isolation - Vendors", () => {
  it("Admin A cannot read or manage Org B's Vendor", async () => {
    mockAuth.mockResolvedValue(orgB.session);
    const { createVendor } = await import("@/lib/actions/maintenance");
    const vendorId = await createVendor(formDataWith({ name: "Org B Vendor" }));

    mockAuth.mockResolvedValue(orgA.session);
    const { getVendorById, updateVendor, setVendorActive } = await import("@/lib/actions/maintenance");
    await expect(getVendorById(vendorId)).rejects.toThrow();
    await expect(updateVendor(vendorId, formDataWith({ name: "Hacked name" }))).rejects.toThrow();
    await expect(setVendorActive(vendorId, false)).rejects.toThrow();

    const stillOrgBsVendor = await prisma.maintenanceVendor.findUniqueOrThrow({ where: { id: vendorId } });
    expect(stillOrgBsVendor.name).toBe("Org B Vendor");
    expect(stillOrgBsVendor.active).toBe(true);
  });

  it("Admin A cannot assign Org A's Work Order to Org B's Vendor (cross-org vendorId injection)", async () => {
    mockAuth.mockResolvedValue(orgB.session);
    const { createVendor } = await import("@/lib/actions/maintenance");
    const vendorBId = await createVendor(formDataWith({ name: "Vendor B" }));

    const { workOrderId } = await seedRequestAndWorkOrder(orgA);
    mockAuth.mockResolvedValue(orgA.session);
    const { assignWorkOrder } = await import("@/lib/actions/maintenance");
    await expect(assignWorkOrder(workOrderId, formDataWith({ vendorId: vendorBId }))).rejects.toThrow();
    const workOrder = await prisma.maintenanceWorkOrder.findUniqueOrThrow({ where: { id: workOrderId } });
    expect(workOrder.vendorId).toBeNull();
  });
});

describe("Maintenance relation-injection rejection (same-org, logically invalid relations) - Step 84", () => {
  it("rejects Unit A + a Contract that actually belongs to Unit B", async () => {
    const { contract: contractForOtherUnit } = await createTestContract(orgA, { unitNumber: `RLA-${Date.now()}` });
    mockAuth.mockResolvedValue(orgA.session);
    const { createMaintenanceRequest } = await import("@/lib/actions/maintenance");

    // org.unit is a different Unit than contractForOtherUnit's own Unit.
    await expect(
      createMaintenanceRequest(
        formDataWith({ scopeType: "UNIT", unitId: orgA.unit.id, contractId: contractForOtherUnit.id, category: "GENERAL", title: "Mismatched contract", reportedByType: "STAFF" })
      )
    ).rejects.toThrow();
    expect(await prisma.maintenanceRequest.count({ where: { unitId: orgA.unit.id, contractId: contractForOtherUnit.id } })).toBe(0);
  });

  it("rejects Unit A + Contract A + an unrelated Renter (not the Contract's own Renter)", async () => {
    const { unit, contract } = await createTestContract(orgA, { unitNumber: `RLB-${Date.now()}` });
    mockAuth.mockResolvedValue(orgA.session);
    const { createMaintenanceRequest } = await import("@/lib/actions/maintenance");

    // A second, unrelated Renter in the same org.
    const unrelatedRenter = await prisma.renter.create({ data: { organizationId: orgA.organization.id, fullName: "Unrelated Renter" } });

    await expect(
      createMaintenanceRequest(
        formDataWith({ scopeType: "UNIT", unitId: unit.id, contractId: contract.id, renterId: unrelatedRenter.id, category: "GENERAL", title: "Mismatched renter", reportedByType: "STAFF" })
      )
    ).rejects.toThrow();
  });

  it("rejects BUILDING_COMMON_AREA scope that also supplies a unitId", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createMaintenanceRequest } = await import("@/lib/actions/maintenance");
    await expect(
      createMaintenanceRequest(
        formDataWith({ scopeType: "BUILDING_COMMON_AREA", buildingId: orgA.building.id, unitId: orgA.unit.id, category: "ELEVATOR", title: "Elevator", reportedByType: "STAFF" })
      )
    ).rejects.toThrow();
  });

  it("rejects COMPOUND_COMMON_AREA scope that also supplies a buildingId", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createMaintenanceRequest } = await import("@/lib/actions/maintenance");
    await expect(
      createMaintenanceRequest(
        formDataWith({ scopeType: "COMPOUND_COMMON_AREA", compoundId: orgA.compound.id, buildingId: orgA.building.id, category: "LANDSCAPING", title: "Garden", reportedByType: "STAFF" })
      )
    ).rejects.toThrow();
  });

  it("rejects a Building that belongs to a different organization (cross-org buildingId for COMPOUND scope's own building check n/a, verified via BUILDING_COMMON_AREA)", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createMaintenanceRequest } = await import("@/lib/actions/maintenance");
    await expect(
      createMaintenanceRequest(formDataWith({ scopeType: "BUILDING_COMMON_AREA", buildingId: orgB.building.id, category: "FIRE_SAFETY", title: "Fire panel", reportedByType: "STAFF" }))
    ).rejects.toThrow();
  });
});

describe("Maintenance IDOR - every id type is org-verified (Step 83)", () => {
  it("rejects a compoundId belonging to another organization", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createMaintenanceRequest } = await import("@/lib/actions/maintenance");
    await expect(
      createMaintenanceRequest(formDataWith({ scopeType: "COMPOUND_COMMON_AREA", compoundId: orgB.compound.id, category: "POOL", title: "Pool", reportedByType: "STAFF" }))
    ).rejects.toThrow();
  });

  it("rejects a unitId belonging to another organization", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createMaintenanceRequest } = await import("@/lib/actions/maintenance");
    await expect(
      createMaintenanceRequest(formDataWith({ scopeType: "UNIT", unitId: orgB.unit.id, category: "GENERAL", title: "x", reportedByType: "STAFF" }))
    ).rejects.toThrow();
  });

  it("rejects a moveInId/moveInInspectionItemId belonging to another organization", async () => {
    const { unit: unitB, contract: contractB } = await createTestContract(orgB, { unitNumber: `IDOR-${Date.now()}` });
    mockAuth.mockResolvedValue(orgB.session);
    const { createMoveIn, startMoveIn } = await import("@/lib/actions/move-ins");
    const moveInIdB = await createMoveIn(formDataWith({ contractId: contractB.id }));
    await startMoveIn(moveInIdB);
    const itemB = await prisma.moveInInspectionItem.findFirstOrThrow({ where: { moveInId: moveInIdB } });

    mockAuth.mockResolvedValue(orgA.session);
    const { createMaintenanceRequestFromMoveIn } = await import("@/lib/actions/maintenance");
    await expect(createMaintenanceRequestFromMoveIn(formDataWith({ moveInId: moveInIdB, inspectionItemId: itemB.id, category: "GENERAL", title: "x" }))).rejects.toThrow();
    void unitB;
  });
});
