/**
 * STEP 30 - real, database-backed double-booking prevention tests. Every
 * assertion calls the actual createViewing()/rescheduleViewing() server
 * actions against the real database, proving the overlap check inside
 * checkAgentAvailability()/checkUnitAvailability() (src/lib/actions/
 * viewings.ts), not just the pure hasTimeOverlap() unit test.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestUser, createTestUnit, createTestViewing, type SeededOrg } from "./db-test-helpers";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("A");
  mockAuth.mockResolvedValue(org.session);
});

beforeEach(() => {
  mockAuth.mockResolvedValue(org.session);
});

function viewingFormData(overrides: { leadId: string; assignedToUserId: string; unitId: string; start: string; end: string }) {
  const fd = new FormData();
  fd.set("leadId", overrides.leadId);
  fd.set("assignedToUserId", overrides.assignedToUserId);
  fd.set("scheduledStart", overrides.start);
  fd.set("scheduledEnd", overrides.end);
  fd.append("unitIds", overrides.unitId);
  return fd;
}

describe("Double-booking prevention (real DB)", () => {
  it("same agent + overlapping time on a different unit -> rejected", async () => {
    const { createViewing } = await import("@/lib/actions/viewings");
    const agent = await createTestUser(org.organization.id, "MANAGER");
    const unit1 = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "AGENT-CONFLICT-1" });
    const unit2 = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "AGENT-CONFLICT-2" });

    await createViewing(viewingFormData({ leadId: org.lead.id, assignedToUserId: agent.id, unitId: unit1.id, start: "2026-10-01T09:00", end: "2026-10-01T10:00" }));

    await expect(
      createViewing(viewingFormData({ leadId: org.lead.id, assignedToUserId: agent.id, unitId: unit2.id, start: "2026-10-01T09:30", end: "2026-10-01T10:30" }))
    ).rejects.toThrow();
  });

  it("same unit + overlapping time with a different agent -> rejected", async () => {
    const { createViewing } = await import("@/lib/actions/viewings");
    const agentX = await createTestUser(org.organization.id, "MANAGER");
    const agentY = await createTestUser(org.organization.id, "MANAGER");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "UNIT-CONFLICT-1" });

    await createViewing(viewingFormData({ leadId: org.lead.id, assignedToUserId: agentX.id, unitId: unit.id, start: "2026-10-02T09:00", end: "2026-10-02T10:00" }));

    await expect(
      createViewing(viewingFormData({ leadId: org.lead.id, assignedToUserId: agentY.id, unitId: unit.id, start: "2026-10-02T09:30", end: "2026-10-02T10:30" }))
    ).rejects.toThrow();
  });

  it("different agent AND different unit with overlapping time -> allowed", async () => {
    const { createViewing } = await import("@/lib/actions/viewings");
    const agentX = await createTestUser(org.organization.id, "MANAGER");
    const agentY = await createTestUser(org.organization.id, "MANAGER");
    const unitX = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "NO-CONFLICT-X" });
    const unitY = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "NO-CONFLICT-Y" });

    await createViewing(viewingFormData({ leadId: org.lead.id, assignedToUserId: agentX.id, unitId: unitX.id, start: "2026-10-03T09:00", end: "2026-10-03T10:00" }));

    const secondViewingId = await createViewing(
      viewingFormData({ leadId: org.lead.id, assignedToUserId: agentY.id, unitId: unitY.id, start: "2026-10-03T09:30", end: "2026-10-03T10:30" })
    );
    expect(secondViewingId).toBeTruthy();
  });

  it("a CANCELLED viewing in the same slot does not block a new one", async () => {
    const { createViewing, cancelViewing } = await import("@/lib/actions/viewings");
    const agent = await createTestUser(org.organization.id, "MANAGER");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "CANCELLED-SLOT" });

    const firstId = await createViewing(viewingFormData({ leadId: org.lead.id, assignedToUserId: agent.id, unitId: unit.id, start: "2026-10-04T09:00", end: "2026-10-04T10:00" }));
    const cancelFd = new FormData();
    cancelFd.set("viewingId", firstId);
    cancelFd.set("cancelReason", "CUSTOMER_REQUEST");
    await cancelViewing(cancelFd);

    const secondId = await createViewing(viewingFormData({ leadId: org.lead.id, assignedToUserId: agent.id, unitId: unit.id, start: "2026-10-04T09:00", end: "2026-10-04T10:00" }));
    expect(secondId).toBeTruthy();
  });

  it("a COMPLETED viewing in the same slot does not block a new one", async () => {
    const { createViewing } = await import("@/lib/actions/viewings");
    const agent = await createTestUser(org.organization.id, "MANAGER");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "COMPLETED-SLOT" });

    // Fixture directly at COMPLETED (bypassing the confirm/start/complete
    // chain, which is exercised separately in viewing-rules.test.ts and the
    // lead-integration db test) - here we only need a non-blocking terminal
    // status already occupying the slot.
    await createTestViewing(org.organization.id, org.lead.id, [unit.id], org.admin.id, {
      assignedToUserId: agent.id,
      scheduledStart: new Date("2026-10-05T09:00:00Z"),
      scheduledEnd: new Date("2026-10-05T10:00:00Z"),
      status: "COMPLETED",
    });

    const newId = await createViewing(viewingFormData({ leadId: org.lead.id, assignedToUserId: agent.id, unitId: unit.id, start: "2026-10-05T09:00", end: "2026-10-05T10:00" }));
    expect(newId).toBeTruthy();
  });

  it("boundary case: existing ends at 11:00, new starts at 11:00 -> allowed", async () => {
    const { createViewing } = await import("@/lib/actions/viewings");
    const agent = await createTestUser(org.organization.id, "MANAGER");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "BOUNDARY-SLOT" });

    await createViewing(viewingFormData({ leadId: org.lead.id, assignedToUserId: agent.id, unitId: unit.id, start: "2026-10-06T10:00", end: "2026-10-06T11:00" }));

    const backToBackId = await createViewing(viewingFormData({ leadId: org.lead.id, assignedToUserId: agent.id, unitId: unit.id, start: "2026-10-06T11:00", end: "2026-10-06T12:00" }));
    expect(backToBackId).toBeTruthy();
  });

  it("rescheduleViewing re-validates and rejects a new overlapping slot", async () => {
    const { createViewing, rescheduleViewing } = await import("@/lib/actions/viewings");
    const agent = await createTestUser(org.organization.id, "MANAGER");
    const unitBlocking = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "RESCHEDULE-BLOCKER" });
    const unitMoving = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "RESCHEDULE-MOVING" });

    await createViewing(viewingFormData({ leadId: org.lead.id, assignedToUserId: agent.id, unitId: unitBlocking.id, start: "2026-10-07T14:00", end: "2026-10-07T15:00" }));
    const movingId = await createViewing(viewingFormData({ leadId: org.lead.id, assignedToUserId: agent.id, unitId: unitMoving.id, start: "2026-10-07T09:00", end: "2026-10-07T10:00" }));

    const fd = new FormData();
    fd.set("viewingId", movingId);
    fd.set("scheduledStart", "2026-10-07T14:30");
    fd.set("scheduledEnd", "2026-10-07T15:30");
    await expect(rescheduleViewing(fd)).rejects.toThrow();
  });

  it("rescheduleViewing allows moving into a genuinely free slot and resets status to SCHEDULED", async () => {
    const { createViewing, rescheduleViewing } = await import("@/lib/actions/viewings");
    const { prisma } = await import("@/lib/prisma");
    const agent = await createTestUser(org.organization.id, "MANAGER");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "RESCHEDULE-FREE" });

    const viewingId = await createViewing(viewingFormData({ leadId: org.lead.id, assignedToUserId: agent.id, unitId: unit.id, start: "2026-10-08T09:00", end: "2026-10-08T10:00" }));

    const fd = new FormData();
    fd.set("viewingId", viewingId);
    fd.set("scheduledStart", "2026-10-08T13:00");
    fd.set("scheduledEnd", "2026-10-08T14:00");
    await rescheduleViewing(fd);

    const updated = await prisma.viewing.findUniqueOrThrow({ where: { id: viewingId } });
    expect(updated.status).toBe("SCHEDULED");
    expect(updated.scheduledStart.toISOString()).toContain("13:00");
  });
});
