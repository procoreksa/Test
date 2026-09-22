/**
 * STEP 22/30 - real, database-backed cross-organization security tests for
 * the CRM Leads foundation, following the exact pattern established in
 * cross-org-security.db.test.ts / idor.db.test.ts: two real organizations,
 * real Admin users, only the NextAuth session boundary mocked. A passing
 * test here proves the organizationId filter in the actual Prisma query,
 * not a mock.
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

describe("CRM cross-organization isolation: Admin A cannot read/modify Organization B's leads", () => {
  it("cannot read Lead B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { getLeadById } = await import("@/lib/actions/leads");
    await expect(getLeadById(orgB.lead.id)).rejects.toThrow();
  });

  it("cannot update Lead B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { updateLead } = await import("@/lib/actions/leads");
    const fd = new FormData();
    fd.set("leadId", orgB.lead.id);
    fd.set("leadType", "INDIVIDUAL");
    fd.set("mobile", "0559999999");
    fd.set("source", "WEBSITE");
    fd.set("firstName", "Hijacked");
    await expect(updateLead(fd)).rejects.toThrow();

    const { prisma } = await import("@/lib/prisma");
    const stillIntact = await prisma.lead.findUniqueOrThrow({ where: { id: orgB.lead.id } });
    expect(stillIntact.fullName).toBe(orgB.lead.fullName);
  });

  it("cannot change Lead B's status", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { changeLeadStatus } = await import("@/lib/actions/leads");
    await expect(changeLeadStatus(orgB.lead.id, "QUALIFIED")).rejects.toThrow();
  });

  it("cannot assign Lead B to Admin A (or anyone)", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { assignLead } = await import("@/lib/actions/leads");
    await expect(assignLead(orgB.lead.id, orgA.admin.id)).rejects.toThrow();
  });

  it("cannot create an activity for Lead B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createLeadActivity, listLeadActivities } = await import("@/lib/actions/lead-activities");
    const fd = new FormData();
    fd.set("leadId", orgB.lead.id);
    fd.set("activityType", "CALL");
    fd.set("subject", "Cross-org attempt");
    await expect(createLeadActivity(fd)).rejects.toThrow();

    // Even if the write had silently succeeded, Org B's own activity list
    // must never show an Org A actor's row - defense in depth.
    mockAuth.mockResolvedValue(orgB.session);
    const activities = await listLeadActivities(orgB.lead.id);
    expect(activities.every((a) => a.createdByUserId !== orgA.admin.id)).toBe(true);
  });

  it("cannot mark Lead B as lost", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { markLeadLost } = await import("@/lib/actions/leads");
    const fd = new FormData();
    fd.set("leadId", orgB.lead.id);
    fd.set("lostReason", "PRICE");
    await expect(markLeadLost(fd)).rejects.toThrow();
  });

  it("cannot archive Lead B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { archiveLead } = await import("@/lib/actions/leads");
    await expect(archiveLead(orgB.lead.id)).rejects.toThrow();
  });

  it("cannot convert Lead B to a renter", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { convertLeadToRenter } = await import("@/lib/actions/leads");
    const fd = new FormData();
    fd.set("leadId", orgB.lead.id);
    fd.set("mode", "new");
    await expect(convertLeadToRenter(fd)).rejects.toThrow();

    const { prisma } = await import("@/lib/prisma");
    const stillUnconverted = await prisma.lead.findUniqueOrThrow({ where: { id: orgB.lead.id } });
    expect(stillUnconverted.convertedRenterId).toBeNull();
    expect(stillUnconverted.status).not.toBe("WON");
  });

  it("cannot link Lead A to Renter B during conversion (IDOR on renterId)", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { convertLeadToRenter } = await import("@/lib/actions/leads");
    const fd = new FormData();
    fd.set("leadId", orgA.lead.id);
    fd.set("mode", "link");
    fd.set("renterId", orgB.renter.id); // IDOR: renter id from another org
    await expect(convertLeadToRenter(fd)).rejects.toThrow();

    const { prisma } = await import("@/lib/prisma");
    const leadAfter = await prisma.lead.findUniqueOrThrow({ where: { id: orgA.lead.id } });
    expect(leadAfter.convertedRenterId).toBeNull();
  });

  it("cannot set Lead A's preferredCompoundId to Compound B (IDOR on compound reference)", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { updateLead } = await import("@/lib/actions/leads");
    const fd = new FormData();
    fd.set("leadId", orgA.lead.id);
    fd.set("leadType", "INDIVIDUAL");
    fd.set("mobile", orgA.lead.mobile);
    fd.set("source", "WEBSITE");
    fd.set("preferredCompoundId", orgB.compound.id); // IDOR: compound id from another org
    await expect(updateLead(fd)).rejects.toThrow();
  });

  it("cannot assign Lead A to a User from Org B (IDOR on assignedToUserId)", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { assignLead } = await import("@/lib/actions/leads");
    await expect(assignLead(orgA.lead.id, orgB.admin.id)).rejects.toThrow();
  });

  it("Org A's lead list never contains Org B's leads", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { listLeads } = await import("@/lib/actions/leads");
    const { rows } = await listLeads({});
    expect(rows.some((l) => l.id === orgB.lead.id)).toBe(false);
  });
});

describe("CRM cross-organization isolation: reverse direction (Admin B against Organization A)", () => {
  it("cannot read or convert Lead A", async () => {
    mockAuth.mockResolvedValue(orgB.session);
    const { getLeadById, convertLeadToRenter } = await import("@/lib/actions/leads");
    await expect(getLeadById(orgA.lead.id)).rejects.toThrow();

    const fd = new FormData();
    fd.set("leadId", orgA.lead.id);
    fd.set("mode", "new");
    await expect(convertLeadToRenter(fd)).rejects.toThrow();
  });

  it("cannot create an activity for, or assign, Lead A", async () => {
    mockAuth.mockResolvedValue(orgB.session);
    const { assignLead } = await import("@/lib/actions/leads");
    const { createLeadActivity } = await import("@/lib/actions/lead-activities");

    await expect(assignLead(orgA.lead.id, orgB.admin.id)).rejects.toThrow();

    const fd = new FormData();
    fd.set("leadId", orgA.lead.id);
    fd.set("activityType", "NOTE");
    fd.set("notes", "Cross-org attempt from B");
    await expect(createLeadActivity(fd)).rejects.toThrow();
  });
});

describe("CRM IDOR: a second user in the same org as the caller is still a valid assignment target", () => {
  it("positive control: Admin A can assign Lead A to another Org A user", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { assignLead } = await import("@/lib/actions/leads");
    const secondUser = await createTestUser(orgA.organization.id, "MANAGER");

    await assignLead(orgA.lead.id, secondUser.id);

    const { prisma } = await import("@/lib/prisma");
    const updated = await prisma.lead.findUniqueOrThrow({ where: { id: orgA.lead.id } });
    expect(updated.assignedToUserId).toBe(secondUser.id);
  });
});
