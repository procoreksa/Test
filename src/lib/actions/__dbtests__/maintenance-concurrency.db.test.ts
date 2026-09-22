/**
 * Real, database-backed concurrency tests for Maintenance Management
 * (Step 80/98): duplicate Work Order creation for the same Request, a
 * double-close race on the same Work Order, and concurrent number
 * generation - all using the same Serializable-transaction protection
 * already established elsewhere in this codebase (see
 * reservation-contract-concurrency.db.test.ts). No sleep-based timing;
 * every race is driven by genuinely concurrent Promise.allSettled() calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeEach(async () => {
  await resetDatabase();
  org = await seedFullOrg("CC");
  mockAuth.mockResolvedValue(org.session);
});

function formDataWith(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("Maintenance Work Order creation concurrency (Step 80/81)", () => {
  it("of two simultaneous Work Order creation attempts for the same TRIAGED Request, exactly one Work Order results", async () => {
    const { createMaintenanceRequest, triageMaintenanceRequest, createWorkOrderFromRequest } = await import("@/lib/actions/maintenance");

    const requestId = await createMaintenanceRequest(formDataWith({ scopeType: "UNIT", unitId: org.unit.id, category: "GENERAL", title: "Race test", reportedByType: "STAFF" }));
    await triageMaintenanceRequest(requestId, formDataWith({}));

    const results = await Promise.allSettled([createWorkOrderFromRequest(requestId, formDataWith({})), createWorkOrderFromRequest(requestId, formDataWith({}))]);

    const fulfilled = results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled");
    expect(fulfilled.length).toBe(1);

    const workOrders = await prisma.maintenanceWorkOrder.findMany({ where: { requestId } });
    expect(workOrders).toHaveLength(1);

    const request = await prisma.maintenanceRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request.status).toBe("WORK_ORDER_CREATED");
  });
});

describe("Maintenance Work Order close concurrency (Step 80/81)", () => {
  it("of two simultaneous close attempts on the same VERIFIED Work Order, exactly one close (and one Request resolution) results", async () => {
    const { createMaintenanceRequest, triageMaintenanceRequest, createWorkOrderFromRequest, assignWorkOrder, startWorkOrder, completeWorkOrder, verifyWorkOrder, closeWorkOrder } = await import(
      "@/lib/actions/maintenance"
    );

    const requestId = await createMaintenanceRequest(formDataWith({ scopeType: "UNIT", unitId: org.unit.id, category: "GENERAL", title: "Close race", reportedByType: "STAFF" }));
    await triageMaintenanceRequest(requestId, formDataWith({}));
    const workOrderId = await createWorkOrderFromRequest(requestId, formDataWith({}));
    await assignWorkOrder(workOrderId, formDataWith({ assignedToUserId: org.admin.id }));
    await startWorkOrder(workOrderId);
    await completeWorkOrder(workOrderId, formDataWith({ workPerformed: "Done", completionNotes: "OK" }));
    await verifyWorkOrder(workOrderId, formDataWith({}));

    const results = await Promise.allSettled([closeWorkOrder(workOrderId), closeWorkOrder(workOrderId)]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBe(1);

    const workOrder = await prisma.maintenanceWorkOrder.findUniqueOrThrow({ where: { id: workOrderId } });
    expect(workOrder.status).toBe("CLOSED");

    const request = await prisma.maintenanceRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(request.status).toBe("RESOLVED");

    // Exactly one "to: RESOLVED" audit entry - no duplicate resolution side effect.
    const resolvedAudits = await prisma.auditLog.findMany({ where: { organizationId: org.organization.id, entityType: "MaintenanceRequest", entityId: requestId } });
    const resolvedTransitions = resolvedAudits.filter((a) => (a.metadata as { to?: string } | null)?.to === "RESOLVED");
    expect(resolvedTransitions).toHaveLength(1);
  });
});

describe("Maintenance numbering concurrency (Step 4/14/80)", () => {
  // Two genuinely concurrent Serializable transactions against the SAME
  // Counter row (per docs/RESERVATION-MANAGEMENT.md's own established
  // pattern - see reservation-concurrency.db.test.ts): under Postgres
  // Serializable Snapshot Isolation one may legitimately abort and must be
  // retried by the caller - the invariant under test is "no two Requests
  // ever get the same number," not "every concurrent attempt succeeds
  // without retry."
  it("never issues the same request number twice under concurrent creation", async () => {
    const { createMaintenanceRequest } = await import("@/lib/actions/maintenance");

    const results = await Promise.allSettled([
      createMaintenanceRequest(formDataWith({ scopeType: "UNIT", unitId: org.unit.id, category: "GENERAL", title: "Numbering A", reportedByType: "STAFF" })),
      createMaintenanceRequest(formDataWith({ scopeType: "UNIT", unitId: org.unit.id, category: "GENERAL", title: "Numbering B", reportedByType: "STAFF" })),
    ]);

    const fulfilled = results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const requests = await prisma.maintenanceRequest.findMany({ where: { id: { in: fulfilled.map((r) => r.value) } }, select: { requestNumber: true } });
    const numbers = requests.map((r) => r.requestNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("never issues the same Work Order number twice under concurrent creation across different Requests", async () => {
    const { createMaintenanceRequest, triageMaintenanceRequest, createWorkOrderFromRequest } = await import("@/lib/actions/maintenance");

    const requestAId = await createMaintenanceRequest(formDataWith({ scopeType: "UNIT", unitId: org.unit.id, category: "GENERAL", title: "WO numbering A", reportedByType: "STAFF" }));
    const requestBId = await createMaintenanceRequest(formDataWith({ scopeType: "UNIT", unitId: org.unit.id, category: "GENERAL", title: "WO numbering B", reportedByType: "STAFF" }));
    await triageMaintenanceRequest(requestAId, formDataWith({}));
    await triageMaintenanceRequest(requestBId, formDataWith({}));

    const results = await Promise.allSettled([createWorkOrderFromRequest(requestAId, formDataWith({})), createWorkOrderFromRequest(requestBId, formDataWith({}))]);
    const fulfilled = results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const workOrders = await prisma.maintenanceWorkOrder.findMany({ where: { id: { in: fulfilled.map((r) => r.value) } }, select: { workOrderNumber: true } });
    const numbers = workOrders.map((w) => w.workOrderNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});
