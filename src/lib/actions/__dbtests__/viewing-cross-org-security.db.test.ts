/**
 * STEP 28/29 - real, database-backed cross-organization security and IDOR
 * tests for Viewing Management, following the exact pattern established in
 * cross-org-security.db.test.ts / crm-cross-org-security.db.test.ts: two
 * real organizations, real Admin users, only the NextAuth session boundary
 * mocked. A passing test proves the organizationId filter in the actual
 * Prisma query, not a mock.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestUser, type SeededOrg } from "./db-test-helpers";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let orgA: SeededOrg;
let orgB: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  orgA = await seedFullOrg("A");
  orgB = await seedFullOrg("B");
});

beforeEach(() => {
  mockAuth.mockReset();
});

describe("Viewing cross-organization isolation: Admin A cannot read/modify Organization B's viewings", () => {
  it("cannot read Viewing B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { getViewingById } = await import("@/lib/actions/viewings");
    await expect(getViewingById(orgB.viewing.id)).rejects.toThrow();
  });

  it("cannot confirm/start Viewing B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { confirmViewing, startViewing } = await import("@/lib/actions/viewings");
    await expect(confirmViewing(orgB.viewing.id)).rejects.toThrow();
    await expect(startViewing(orgB.viewing.id)).rejects.toThrow();
  });

  it("cannot complete Viewing B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { completeViewing } = await import("@/lib/actions/viewings");
    const fd = new FormData();
    fd.set("viewingId", orgB.viewing.id);
    fd.set("outcome", "INTERESTED");
    await expect(completeViewing(fd)).rejects.toThrow();

    const { prisma } = await import("@/lib/prisma");
    const stillScheduled = await prisma.viewing.findUniqueOrThrow({ where: { id: orgB.viewing.id } });
    expect(stillScheduled.status).toBe("SCHEDULED");
  });

  it("cannot cancel or mark Viewing B as no-show", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { cancelViewing, markViewingNoShow } = await import("@/lib/actions/viewings");
    const fd = new FormData();
    fd.set("viewingId", orgB.viewing.id);
    fd.set("cancelReason", "CUSTOMER_REQUEST");
    await expect(cancelViewing(fd)).rejects.toThrow();
    await expect(markViewingNoShow(orgB.viewing.id)).rejects.toThrow();
  });

  it("cannot reschedule Viewing B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { rescheduleViewing } = await import("@/lib/actions/viewings");
    const fd = new FormData();
    fd.set("viewingId", orgB.viewing.id);
    fd.set("scheduledStart", "2026-08-01T10:00");
    fd.set("scheduledEnd", "2026-08-01T11:00");
    await expect(rescheduleViewing(fd)).rejects.toThrow();
  });

  it("cannot reassign Viewing B's agent", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { reassignViewingAgent } = await import("@/lib/actions/viewings");
    await expect(reassignViewingAgent(orgB.viewing.id, orgA.admin.id)).rejects.toThrow();
  });

  it("Org A's viewing list never contains Org B's viewings", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { listViewings } = await import("@/lib/actions/viewings");
    const { rows } = await listViewings({});
    expect(rows.some((v) => v.id === orgB.viewing.id)).toBe(false);
  });
});

describe("Viewing IDOR: direct cross-org id substitution is rejected on creation", () => {
  it("cannot create a viewing attaching Lead B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createViewing } = await import("@/lib/actions/viewings");
    const fd = new FormData();
    fd.set("leadId", orgB.lead.id); // IDOR: lead id from another org
    fd.set("assignedToUserId", orgA.admin.id);
    fd.set("scheduledStart", "2026-08-02T10:00");
    fd.set("scheduledEnd", "2026-08-02T11:00");
    fd.append("unitIds", orgA.unit.id);
    await expect(createViewing(fd)).rejects.toThrow();
  });

  it("cannot create a viewing assigning User B as the agent", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createViewing } = await import("@/lib/actions/viewings");
    const fd = new FormData();
    fd.set("leadId", orgA.lead.id);
    fd.set("assignedToUserId", orgB.admin.id); // IDOR: user id from another org
    fd.set("scheduledStart", "2026-08-02T10:00");
    fd.set("scheduledEnd", "2026-08-02T11:00");
    fd.append("unitIds", orgA.unit.id);
    await expect(createViewing(fd)).rejects.toThrow();
  });

  it("cannot create a viewing attaching Unit B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createViewing } = await import("@/lib/actions/viewings");
    const fd = new FormData();
    fd.set("leadId", orgA.lead.id);
    fd.set("assignedToUserId", orgA.admin.id);
    fd.set("scheduledStart", "2026-08-02T10:00");
    fd.set("scheduledEnd", "2026-08-02T11:00");
    fd.append("unitIds", orgB.unit.id); // IDOR: unit id from another org
    await expect(createViewing(fd)).rejects.toThrow();
  });

  it("cannot reassign Viewing A's agent to User B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { reassignViewingAgent } = await import("@/lib/actions/viewings");
    await expect(reassignViewingAgent(orgA.viewing.id, orgB.admin.id)).rejects.toThrow();
  });
});

describe("Viewing cross-organization isolation: reverse direction (Admin B against Organization A)", () => {
  it("cannot read or complete Viewing A", async () => {
    mockAuth.mockResolvedValue(orgB.session);
    const { getViewingById, completeViewing } = await import("@/lib/actions/viewings");
    await expect(getViewingById(orgA.viewing.id)).rejects.toThrow();

    const fd = new FormData();
    fd.set("viewingId", orgA.viewing.id);
    fd.set("outcome", "INTERESTED");
    await expect(completeViewing(fd)).rejects.toThrow();
  });
});

describe("Viewing IDOR: positive control", () => {
  it("Admin A can create a viewing assigning another Org A user as agent", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createViewing } = await import("@/lib/actions/viewings");
    const secondUser = await createTestUser(orgA.organization.id, "MANAGER");

    const fd = new FormData();
    fd.set("leadId", orgA.lead.id);
    fd.set("assignedToUserId", secondUser.id);
    fd.set("scheduledStart", "2026-09-01T10:00");
    fd.set("scheduledEnd", "2026-09-01T11:00");
    fd.append("unitIds", orgA.unit.id);

    const viewingId = await createViewing(fd);
    expect(viewingId).toBeTruthy();
  });
});
