/**
 * Real, database-backed lifecycle/regression tests for Maintenance
 * Management (docs/MAINTENANCE-MANAGEMENT.md): full happy-path flow
 * (Request -> Triage -> Work Order -> Assign -> Schedule -> Start ->
 * Diagnose -> Labor -> Parts -> Cost -> Complete -> Verify -> Close),
 * the financial isolation regression (Step 86 - zero accounting side
 * effects), and the Move-In immutability regression (Step 87 - creating a
 * Request from a Move-In defect never mutates the Move-In baseline).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestContract, seedFinancialsForOrg, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("MNT");
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

describe("Maintenance full lifecycle (Step 99)", () => {
  it("drives Request -> Triage -> Work Order -> Assign -> Schedule -> Start -> Diagnose -> Labor -> Parts -> Cost -> Complete -> Verify -> Close", async () => {
    const {
      createMaintenanceRequest,
      triageMaintenanceRequest,
      createWorkOrderFromRequest,
      assignWorkOrder,
      scheduleWorkOrder,
      startWorkOrder,
      diagnoseWorkOrder,
      addLaborEntry,
      addPartEntry,
      addCostEntry,
      completeWorkOrder,
      verifyWorkOrder,
      closeWorkOrder,
    } = await import("@/lib/actions/maintenance");

    const requestId = await createMaintenanceRequest(
      formDataWith({
        scopeType: "UNIT",
        unitId: org.unit.id,
        category: "PLUMBING",
        priority: "HIGH",
        title: "Leaking pipe",
        reportedByType: "TENANT",
      })
    );

    let request = await prisma.maintenanceRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request.status).toBe("OPEN");
    expect(request.compoundId).toBe(org.compound.id);
    expect(request.buildingId).toBe(org.building.id);
    expect(request.responseDueAt).not.toBeNull();
    expect(request.resolutionDueAt).not.toBeNull();

    await triageMaintenanceRequest(requestId, formDataWith({ priority: "HIGH", assignedToUserId: org.admin.id, triageNotes: "Confirmed leak" }));
    request = await prisma.maintenanceRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request.status).toBe("TRIAGED");
    expect(request.firstResponseAt).not.toBeNull();
    const firstResponseAt = request.firstResponseAt;

    // Re-triaging must never overwrite firstResponseAt (Step 28).
    await triageMaintenanceRequest(requestId, formDataWith({ triageNotes: "Updated notes after second look" }));
    request = await prisma.maintenanceRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request.firstResponseAt?.getTime()).toBe(firstResponseAt?.getTime());

    const workOrderId = await createWorkOrderFromRequest(requestId, formDataWith({ priority: "HIGH", estimatedCost: "500" }));
    request = await prisma.maintenanceRequest.findUniqueOrThrow({ where: { id: requestId } });
    // Step 16: creating a Work Order must not itself resolve the Request.
    expect(request.status).toBe("WORK_ORDER_CREATED");

    let workOrder = await prisma.maintenanceWorkOrder.findUniqueOrThrow({ where: { id: workOrderId } });
    expect(workOrder.status).toBe("DRAFT");

    await assignWorkOrder(workOrderId, formDataWith({ assignedToUserId: org.admin.id }));
    workOrder = await prisma.maintenanceWorkOrder.findUniqueOrThrow({ where: { id: workOrderId } });
    expect(workOrder.status).toBe("ASSIGNED");
    expect(workOrder.assignedToUserId).toBe(org.admin.id);

    await scheduleWorkOrder(workOrderId, formDataWith({ scheduledStart: "2027-01-10T09:00", scheduledEnd: "2027-01-10T11:00" }));
    workOrder = await prisma.maintenanceWorkOrder.findUniqueOrThrow({ where: { id: workOrderId } });
    expect(workOrder.status).toBe("SCHEDULED");

    await startWorkOrder(workOrderId);
    workOrder = await prisma.maintenanceWorkOrder.findUniqueOrThrow({ where: { id: workOrderId } });
    expect(workOrder.status).toBe("IN_PROGRESS");
    expect(workOrder.startedAt).not.toBeNull();

    await diagnoseWorkOrder(workOrderId, formDataWith({ diagnosis: "Burst pipe under sink" }));
    workOrder = await prisma.maintenanceWorkOrder.findUniqueOrThrow({ where: { id: workOrderId } });
    expect(workOrder.diagnosis).toBe("Burst pipe under sink");
    expect(workOrder.diagnosedAt).not.toBeNull();

    await addLaborEntry(workOrderId, formDataWith({ description: "Plumber labor", hours: "2", hourlyRate: "50", workDate: "2027-01-10" }));
    await addPartEntry(workOrderId, formDataWith({ itemName: "Pipe fitting", quantity: "3", unitCost: "10" }));
    await addCostEntry(workOrderId, formDataWith({ costType: "TRANSPORT", description: "Transport", amount: "20", date: "2027-01-10" }));

    workOrder = await prisma.maintenanceWorkOrder.findUniqueOrThrow({ where: { id: workOrderId } });
    // Labor 2h x 50 = 100, Parts 3 x 10 = 30, Other = 20 -> 150 total, Decimal-exact.
    expect(Number(workOrder.actualCost)).toBe(150);

    await completeWorkOrder(workOrderId, formDataWith({ workPerformed: "Replaced pipe fitting", completionNotes: "Tested, no more leaks" }));
    workOrder = await prisma.maintenanceWorkOrder.findUniqueOrThrow({ where: { id: workOrderId } });
    expect(workOrder.status).toBe("COMPLETED");
    expect(workOrder.completedAt).not.toBeNull();

    await verifyWorkOrder(workOrderId, formDataWith({ verificationNotes: "Confirmed by supervisor" }));
    workOrder = await prisma.maintenanceWorkOrder.findUniqueOrThrow({ where: { id: workOrderId } });
    expect(workOrder.status).toBe("VERIFIED");
    expect(workOrder.verifiedAt).not.toBeNull();
    expect(workOrder.verifiedByUserId).toBe(org.admin.id);

    await closeWorkOrder(workOrderId);
    workOrder = await prisma.maintenanceWorkOrder.findUniqueOrThrow({ where: { id: workOrderId } });
    expect(workOrder.status).toBe("CLOSED");
    expect(workOrder.closedAt).not.toBeNull();

    request = await prisma.maintenanceRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request.status).toBe("RESOLVED");
    expect(request.resolvedAt).not.toBeNull();

    // Audit correctness - meaningful mutations recorded.
    const auditEntries = await prisma.auditLog.findMany({
      where: { organizationId: org.organization.id, entityType: { in: ["MaintenanceRequest", "MaintenanceWorkOrder", "MaintenanceLaborEntry", "MaintenancePartEntry", "MaintenanceCostEntry"] } },
    });
    expect(auditEntries.some((a) => a.entityId === requestId && a.action === "CREATE")).toBe(true);
    expect(auditEntries.some((a) => a.entityId === workOrderId && a.action === "CREATE")).toBe(true);
    expect(auditEntries.some((a) => a.entityType === "MaintenanceLaborEntry" && a.entityId === workOrderId)).toBe(true);
    expect(auditEntries.some((a) => a.entityType === "MaintenancePartEntry" && a.entityId === workOrderId)).toBe(true);

    // Work Log: routine notes are deliberately not audited (Step 78) - none
    // were added in this flow (no hold/resume), so the table stays empty.
    expect(await prisma.maintenanceWorkLog.count({ where: { workOrderId } })).toBe(0);

    // Financial isolation (Step 86, Step 34 boundary): the full lifecycle
    // must produce ZERO Invoice/Payment/PaymentSchedule/OwnerLedgerEntry rows.
    expect(await prisma.invoice.count({ where: { organizationId: org.organization.id } })).toBe(0);
    expect(await prisma.payment.count({ where: { organizationId: org.organization.id } })).toBe(0);
    expect(await prisma.paymentSchedule.count({ where: { organizationId: org.organization.id } })).toBe(0);
    expect(await prisma.ownerLedgerEntry.count({ where: { organizationId: org.organization.id } })).toBe(0);
  });

  it("blocks completing a Work Order before workPerformed/completionNotes are supplied", async () => {
    const { createMaintenanceRequest, triageMaintenanceRequest, createWorkOrderFromRequest, assignWorkOrder, startWorkOrder, completeWorkOrder } = await import("@/lib/actions/maintenance");

    const requestId = await createMaintenanceRequest(
      formDataWith({ scopeType: "UNIT", unitId: org.unit.id, category: "GENERAL", title: "Test", reportedByType: "STAFF" })
    );
    await triageMaintenanceRequest(requestId, formDataWith({}));
    const workOrderId = await createWorkOrderFromRequest(requestId, formDataWith({}));
    await assignWorkOrder(workOrderId, formDataWith({ assignedToUserId: org.admin.id }));
    await startWorkOrder(workOrderId);

    await expect(completeWorkOrder(workOrderId, formDataWith({ workPerformed: "", completionNotes: "" }))).rejects.toThrow();

    const workOrder = await prisma.maintenanceWorkOrder.findUniqueOrThrow({ where: { id: workOrderId } });
    expect(workOrder.status).toBe("IN_PROGRESS");
  });
});

describe("Maintenance financial isolation regression (Step 86)", () => {
  it("creating/completing a Work Order never creates or alters an Invoice/Payment/PaymentSchedule/OwnerLedgerEntry", async () => {
    const financials = await seedFinancialsForOrg(org);
    const invoiceBefore = await prisma.invoice.findUniqueOrThrow({ where: { id: financials.invoice.id } });
    const scheduleBefore = await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: financials.schedule.id } });
    const ledgerCountBefore = await prisma.ownerLedgerEntry.count({ where: { organizationId: org.organization.id } });
    const paymentCountBefore = await prisma.payment.count({ where: { organizationId: org.organization.id } });

    const { createMaintenanceRequest, triageMaintenanceRequest, createWorkOrderFromRequest, assignWorkOrder, startWorkOrder, addLaborEntry, completeWorkOrder, verifyWorkOrder, closeWorkOrder } = await import(
      "@/lib/actions/maintenance"
    );

    const requestId = await createMaintenanceRequest(
      formDataWith({ scopeType: "UNIT", unitId: financials.contract.unitId, contractId: financials.contract.id, renterId: org.renter.id, category: "ELECTRICAL", title: "Socket not working", reportedByType: "TENANT" })
    );
    await triageMaintenanceRequest(requestId, formDataWith({}));
    const workOrderId = await createWorkOrderFromRequest(requestId, formDataWith({}));
    await assignWorkOrder(workOrderId, formDataWith({ assignedToUserId: org.admin.id }));
    await startWorkOrder(workOrderId);
    await addLaborEntry(workOrderId, formDataWith({ description: "Electrician", hours: "1", hourlyRate: "80", workDate: "2027-01-10" }));
    await completeWorkOrder(workOrderId, formDataWith({ workPerformed: "Replaced socket", completionNotes: "Working now" }));
    await verifyWorkOrder(workOrderId, formDataWith({}));
    await closeWorkOrder(workOrderId);

    const invoiceAfter = await prisma.invoice.findUniqueOrThrow({ where: { id: financials.invoice.id } });
    const scheduleAfter = await prisma.paymentSchedule.findUniqueOrThrow({ where: { id: financials.schedule.id } });
    expect(invoiceAfter).toEqual(invoiceBefore);
    expect(scheduleAfter).toEqual(scheduleBefore);
    expect(await prisma.ownerLedgerEntry.count({ where: { organizationId: org.organization.id } })).toBe(ledgerCountBefore);
    expect(await prisma.payment.count({ where: { organizationId: org.organization.id } })).toBe(paymentCountBefore);
  });
});

describe("Maintenance <- Move-In defect traceability & immutability (Step 39/40/87)", () => {
  it("creating a Maintenance Request from a Move-In inspection item never mutates the Move-In or the inspection item", async () => {
    const { unit, contract } = await createTestContract(org, { unitNumber: `MNT-MI-${Date.now()}` });
    const { createMoveIn, startMoveIn, updateInspectionItem } = await import("@/lib/actions/move-ins");
    const { createMaintenanceRequestFromMoveIn } = await import("@/lib/actions/maintenance");

    const moveInId = await createMoveIn(formDataWith({ contractId: contract.id }));
    await startMoveIn(moveInId);
    const item = await prisma.moveInInspectionItem.findFirstOrThrow({ where: { moveInId, isApplicable: true } });
    await updateInspectionItem(formDataWith({ itemId: item.id, condition: "DAMAGED", requiresAttention: "on", notes: "Cracked tile" }));

    const moveInBefore = await prisma.moveIn.findUniqueOrThrow({ where: { id: moveInId } });
    const itemBefore = await prisma.moveInInspectionItem.findUniqueOrThrow({ where: { id: item.id } });

    const requestId = await createMaintenanceRequestFromMoveIn(
      formDataWith({ moveInId, inspectionItemId: item.id, category: "FLOORING", priority: "NORMAL", title: item.itemName, description: "Cracked tile" })
    );

    const moveInAfter = await prisma.moveIn.findUniqueOrThrow({ where: { id: moveInId } });
    const itemAfter = await prisma.moveInInspectionItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(moveInAfter).toEqual(moveInBefore);
    expect(itemAfter).toEqual(itemBefore);

    const request = await prisma.maintenanceRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request.source).toBe("MOVE_IN_INSPECTION");
    expect(request.moveInId).toBe(moveInId);
    expect(request.moveInInspectionItemId).toBe(item.id);
    expect(request.unitId).toBe(unit.id);
  });
});
