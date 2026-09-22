/**
 * STEP 36 - real DB tests for Lead status integration, LeadActivity
 * creation, and AuditLog creation triggered by Viewing actions (Steps
 * 13/14/15 of the brief).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestUnit, type SeededOrg } from "./db-test-helpers";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeEach(async () => {
  await resetDatabase();
  org = await seedFullOrg("A");
  mockAuth.mockResolvedValue(org.session);
});

describe("Lead status integration", () => {
  it("creating a viewing moves a QUALIFIED lead to VIEWING_PENDING", async () => {
    const { createViewing } = await import("@/lib/actions/viewings");
    const { prisma } = await import("@/lib/prisma");

    await prisma.lead.update({ where: { id: org.lead.id }, data: { status: "QUALIFIED" } });
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "LEAD-INTEGRATION-1" });

    const fd = new FormData();
    fd.set("leadId", org.lead.id);
    fd.set("assignedToUserId", org.admin.id);
    fd.set("scheduledStart", "2026-11-01T10:00");
    fd.set("scheduledEnd", "2026-11-01T11:00");
    fd.append("unitIds", unit.id);
    await createViewing(fd);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: org.lead.id } });
    expect(lead.status).toBe("VIEWING_PENDING");
  });

  it("completing a viewing moves the lead to VIEWING_COMPLETED regardless of outcome", async () => {
    const { createViewing, confirmViewing, startViewing, completeViewing } = await import("@/lib/actions/viewings");
    const { prisma } = await import("@/lib/prisma");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "LEAD-INTEGRATION-2" });

    const fd = new FormData();
    fd.set("leadId", org.lead.id);
    fd.set("assignedToUserId", org.admin.id);
    fd.set("scheduledStart", "2026-11-02T10:00");
    fd.set("scheduledEnd", "2026-11-02T11:00");
    fd.append("unitIds", unit.id);
    const viewingId = await createViewing(fd);

    await confirmViewing(viewingId);
    await startViewing(viewingId);

    const completeFd = new FormData();
    completeFd.set("viewingId", viewingId);
    completeFd.set("outcome", "OFFER_REQUESTED");
    await completeViewing(completeFd);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: org.lead.id } });
    // Per docs/VIEWING-MANAGEMENT.md: outcome never auto-advances the lead
    // into OFFER_PENDING - Offers/Reservations aren't built yet.
    expect(lead.status).toBe("VIEWING_COMPLETED");
    expect(lead.status).not.toBe("OFFER_PENDING");
  });

  it("never regresses an already-WON lead's status", async () => {
    const { createViewing } = await import("@/lib/actions/viewings");
    const { prisma } = await import("@/lib/prisma");
    await prisma.lead.update({ where: { id: org.lead.id }, data: { status: "WON" } });
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "LEAD-INTEGRATION-3" });

    const fd = new FormData();
    fd.set("leadId", org.lead.id);
    fd.set("assignedToUserId", org.admin.id);
    fd.set("scheduledStart", "2026-11-03T10:00");
    fd.set("scheduledEnd", "2026-11-03T11:00");
    fd.append("unitIds", unit.id);
    await createViewing(fd);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: org.lead.id } });
    expect(lead.status).toBe("WON");
  });

  it("rejects scheduling a viewing for a LOST or ARCHIVED lead", async () => {
    const { createViewing } = await import("@/lib/actions/viewings");
    const { prisma } = await import("@/lib/prisma");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "LEAD-INTEGRATION-4" });

    for (const status of ["LOST", "ARCHIVED"] as const) {
      await prisma.lead.update({ where: { id: org.lead.id }, data: { status } });
      const fd = new FormData();
      fd.set("leadId", org.lead.id);
      fd.set("assignedToUserId", org.admin.id);
      fd.set("scheduledStart", "2026-11-04T10:00");
      fd.set("scheduledEnd", "2026-11-04T11:00");
      fd.append("unitIds", unit.id);
      await expect(createViewing(fd), `status ${status} should be rejected`).rejects.toThrow();
    }
  });
});

describe("LeadActivity integration", () => {
  it("creates a MEETING activity when a viewing is scheduled", async () => {
    const { createViewing } = await import("@/lib/actions/viewings");
    const { prisma } = await import("@/lib/prisma");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "ACTIVITY-1" });

    const fd = new FormData();
    fd.set("leadId", org.lead.id);
    fd.set("assignedToUserId", org.admin.id);
    fd.set("scheduledStart", "2026-11-05T10:00");
    fd.set("scheduledEnd", "2026-11-05T11:00");
    fd.append("unitIds", unit.id);
    await createViewing(fd);

    const activities = await prisma.leadActivity.findMany({ where: { organizationId: org.organization.id, leadId: org.lead.id, activityType: "MEETING" } });
    expect(activities.length).toBeGreaterThan(0);
  });

  it("creates a STATUS_CHANGE activity when a viewing is cancelled", async () => {
    const { createViewing, cancelViewing } = await import("@/lib/actions/viewings");
    const { prisma } = await import("@/lib/prisma");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "ACTIVITY-2" });

    const fd = new FormData();
    fd.set("leadId", org.lead.id);
    fd.set("assignedToUserId", org.admin.id);
    fd.set("scheduledStart", "2026-11-06T10:00");
    fd.set("scheduledEnd", "2026-11-06T11:00");
    fd.append("unitIds", unit.id);
    const viewingId = await createViewing(fd);

    const cancelFd = new FormData();
    cancelFd.set("viewingId", viewingId);
    cancelFd.set("cancelReason", "CUSTOMER_REQUEST");
    await cancelViewing(cancelFd);

    // Subject text is locale-dependent (the test env's default locale is
    // Arabic - see src/lib/i18n/config.ts), so this checks structure/
    // linkage, not English wording: exactly one STATUS_CHANGE row, tied to
    // this lead, with non-empty content.
    const activities = await prisma.leadActivity.findMany({
      where: { organizationId: org.organization.id, leadId: org.lead.id, activityType: "STATUS_CHANGE" },
      orderBy: { createdAt: "desc" },
    });
    expect(activities.length).toBe(1);
    expect(activities[0].subject).toBeTruthy();
  });
});

describe("AuditLog integration", () => {
  it("records a CREATE audit row when a viewing is created", async () => {
    const { createViewing } = await import("@/lib/actions/viewings");
    const { prisma } = await import("@/lib/prisma");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "AUDIT-1" });

    const fd = new FormData();
    fd.set("leadId", org.lead.id);
    fd.set("assignedToUserId", org.admin.id);
    fd.set("scheduledStart", "2026-11-07T10:00");
    fd.set("scheduledEnd", "2026-11-07T11:00");
    fd.append("unitIds", unit.id);
    const viewingId = await createViewing(fd);

    const auditRow = await prisma.auditLog.findFirstOrThrow({
      where: { organizationId: org.organization.id, entityType: "Viewing", entityId: viewingId, action: "CREATE" },
    });
    expect(auditRow.userId).toBe(org.admin.id);
  });

  it("records a CANCEL audit row when a viewing is cancelled, and a REJECT audit row on no-show", async () => {
    const { createViewing, cancelViewing, markViewingNoShow } = await import("@/lib/actions/viewings");
    const { prisma } = await import("@/lib/prisma");
    const unit1 = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "AUDIT-2" });
    const unit2 = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "AUDIT-3" });

    const fd1 = new FormData();
    fd1.set("leadId", org.lead.id);
    fd1.set("assignedToUserId", org.admin.id);
    fd1.set("scheduledStart", "2026-11-08T10:00");
    fd1.set("scheduledEnd", "2026-11-08T11:00");
    fd1.append("unitIds", unit1.id);
    const cancelledId = await createViewing(fd1);
    const cancelFd = new FormData();
    cancelFd.set("viewingId", cancelledId);
    cancelFd.set("cancelReason", "CUSTOMER_REQUEST");
    await cancelViewing(cancelFd);

    const fd2 = new FormData();
    fd2.set("leadId", org.lead.id);
    fd2.set("assignedToUserId", org.admin.id);
    fd2.set("scheduledStart", "2026-11-09T10:00");
    fd2.set("scheduledEnd", "2026-11-09T11:00");
    fd2.append("unitIds", unit2.id);
    const noShowId = await createViewing(fd2);
    await markViewingNoShow(noShowId);

    const cancelAudit = await prisma.auditLog.findFirstOrThrow({ where: { organizationId: org.organization.id, entityType: "Viewing", entityId: cancelledId, action: "CANCEL" } });
    expect(cancelAudit).toBeTruthy();

    const noShowAudit = await prisma.auditLog.findFirstOrThrow({ where: { organizationId: org.organization.id, entityType: "Viewing", entityId: noShowId, action: "REJECT" } });
    expect(noShowAudit).toBeTruthy();
  });
});
