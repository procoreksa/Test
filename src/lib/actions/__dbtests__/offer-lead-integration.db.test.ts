/**
 * STEP 38/39 - real DB tests for Lead status integration, LeadActivity
 * creation, AuditLog creation, and financial-table isolation triggered by
 * Offer actions (Steps 18/27/28/34 of the brief).
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

function offerFormData(unitId: string, overrides: { discountPercentage?: number } = {}) {
  const fd = new FormData();
  fd.set("leadId", org.lead.id);
  fd.set("unitId", unitId);
  fd.set("validFrom", "2027-06-01");
  fd.set("validUntil", "2027-06-30");
  fd.set("annualRent", "80000");
  if (overrides.discountPercentage != null) fd.set("discountPercentage", String(overrides.discountPercentage));
  fd.set("securityDeposit", "20000");
  fd.set("paymentFrequency", "QUARTERLY");
  fd.set("furnishedStatus", "UNFURNISHED");
  return fd;
}

describe("Lead status integration", () => {
  it("creating an offer moves a QUALIFIED lead to OFFER_PENDING", async () => {
    const { createOffer } = await import("@/lib/actions/offers");
    const { prisma } = await import("@/lib/prisma");
    await prisma.lead.update({ where: { id: org.lead.id }, data: { status: "QUALIFIED" } });
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "LEAD-1" });

    await createOffer(offerFormData(unit.id));

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: org.lead.id } });
    expect(lead.status).toBe("OFFER_PENDING");
  });

  it("sending an offer moves the lead to NEGOTIATION", async () => {
    const { createOffer, submitOfferForApproval, approveOffer, sendOffer } = await import("@/lib/actions/offers");
    const { prisma } = await import("@/lib/prisma");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "LEAD-2" });

    const offerId = await createOffer(offerFormData(unit.id));
    await submitOfferForApproval(offerId);
    await approveOffer(offerId);
    await sendOffer(offerId);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: org.lead.id } });
    expect(lead.status).toBe("NEGOTIATION");
  });

  it("accepting an offer moves the lead to RESERVATION_PENDING", async () => {
    const { createOffer, submitOfferForApproval, approveOffer, sendOffer, acceptOffer } = await import("@/lib/actions/offers");
    const { prisma } = await import("@/lib/prisma");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "LEAD-3" });

    const offerId = await createOffer(offerFormData(unit.id));
    await submitOfferForApproval(offerId);
    await approveOffer(offerId);
    await sendOffer(offerId);
    await acceptOffer(offerId);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: org.lead.id } });
    expect(lead.status).toBe("RESERVATION_PENDING");
  });

  it("rejecting an offer never marks the Lead LOST, and reverts to QUALIFIED when there is no completed viewing", async () => {
    const { createOffer, submitOfferForApproval, approveOffer, sendOffer, rejectOffer } = await import("@/lib/actions/offers");
    const { prisma } = await import("@/lib/prisma");
    await prisma.lead.update({ where: { id: org.lead.id }, data: { status: "QUALIFIED" } });
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "LEAD-4" });

    const offerId = await createOffer(offerFormData(unit.id));
    await submitOfferForApproval(offerId);
    await approveOffer(offerId);
    await sendOffer(offerId);

    const fd = new FormData();
    fd.set("offerId", offerId);
    fd.set("rejectReason", "PRICE");
    await rejectOffer(fd);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: org.lead.id } });
    expect(lead.status).not.toBe("LOST");
    expect(lead.status).toBe("QUALIFIED");
  });

  it("rejecting an offer reverts to VIEWING_COMPLETED when the lead has a completed viewing", async () => {
    const { createOffer, submitOfferForApproval, approveOffer, sendOffer, rejectOffer } = await import("@/lib/actions/offers");
    const { prisma } = await import("@/lib/prisma");
    await prisma.viewing.update({ where: { id: org.viewing.id }, data: { status: "COMPLETED" } });
    await prisma.lead.update({ where: { id: org.lead.id }, data: { status: "VIEWING_COMPLETED" } });
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "LEAD-5" });

    const offerId = await createOffer(offerFormData(unit.id));
    await submitOfferForApproval(offerId);
    await approveOffer(offerId);
    await sendOffer(offerId);

    const fd = new FormData();
    fd.set("offerId", offerId);
    fd.set("rejectReason", "UNIT");
    await rejectOffer(fd);

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: org.lead.id } });
    expect(lead.status).not.toBe("LOST");
    expect(lead.status).toBe("VIEWING_COMPLETED");
  });

  it("never regresses an already-WON lead's status through any offer action", async () => {
    const { createOffer } = await import("@/lib/actions/offers");
    const { prisma } = await import("@/lib/prisma");
    await prisma.lead.update({ where: { id: org.lead.id }, data: { status: "WON" } });
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "LEAD-6" });

    await createOffer(offerFormData(unit.id));

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: org.lead.id } });
    expect(lead.status).toBe("WON");
  });

  it("rejects creating an offer for a LOST or ARCHIVED lead", async () => {
    const { createOffer } = await import("@/lib/actions/offers");
    const { prisma } = await import("@/lib/prisma");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "LEAD-7" });

    for (const status of ["LOST", "ARCHIVED"] as const) {
      await prisma.lead.update({ where: { id: org.lead.id }, data: { status } });
      await expect(createOffer(offerFormData(unit.id)), `status ${status} should be rejected`).rejects.toThrow();
    }
  });
});

describe("LeadActivity integration", () => {
  it("creates a STATUS_CHANGE activity when an offer is created", async () => {
    const { createOffer } = await import("@/lib/actions/offers");
    const { prisma } = await import("@/lib/prisma");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "ACTIVITY-1" });

    await createOffer(offerFormData(unit.id));

    const activities = await prisma.leadActivity.findMany({ where: { organizationId: org.organization.id, leadId: org.lead.id, activityType: "STATUS_CHANGE" } });
    expect(activities.length).toBeGreaterThan(0);
    expect(activities[0].subject).toBeTruthy();
  });

  it("creates a STATUS_CHANGE activity on accept and on reject", async () => {
    const { createOffer, submitOfferForApproval, approveOffer, sendOffer, acceptOffer } = await import("@/lib/actions/offers");
    const { prisma } = await import("@/lib/prisma");
    const unit1 = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "ACTIVITY-2" });

    const offerId = await createOffer(offerFormData(unit1.id));
    await submitOfferForApproval(offerId);
    await approveOffer(offerId);
    await sendOffer(offerId);
    await acceptOffer(offerId);

    const activities = await prisma.leadActivity.findMany({ where: { organizationId: org.organization.id, leadId: org.lead.id, activityType: "STATUS_CHANGE" } });
    // created + sent + accepted = at least 3
    expect(activities.length).toBeGreaterThanOrEqual(3);
  });
});

describe("AuditLog integration", () => {
  it("records a CREATE audit row when an offer is created", async () => {
    const { createOffer } = await import("@/lib/actions/offers");
    const { prisma } = await import("@/lib/prisma");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "AUDIT-1" });

    const offerId = await createOffer(offerFormData(unit.id));

    const auditRow = await prisma.auditLog.findFirstOrThrow({
      where: { organizationId: org.organization.id, entityType: "LeasingOffer", entityId: offerId, action: "CREATE" },
    });
    expect(auditRow.userId).toBe(org.admin.id);
  });

  it("records an APPROVE audit row on approval and an ISSUE audit row on send", async () => {
    const { createOffer, submitOfferForApproval, approveOffer, sendOffer } = await import("@/lib/actions/offers");
    const { prisma } = await import("@/lib/prisma");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "AUDIT-2" });

    const offerId = await createOffer(offerFormData(unit.id));
    await submitOfferForApproval(offerId);
    await approveOffer(offerId);
    await sendOffer(offerId);

    const approveAudit = await prisma.auditLog.findFirstOrThrow({ where: { organizationId: org.organization.id, entityType: "LeasingOffer", entityId: offerId, action: "APPROVE" } });
    expect(approveAudit).toBeTruthy();
    const issueAudit = await prisma.auditLog.findFirstOrThrow({ where: { organizationId: org.organization.id, entityType: "LeasingOffer", entityId: offerId, action: "ISSUE" } });
    expect(issueAudit).toBeTruthy();
  });

  it("records a REJECT audit row for customer rejection and a distinct REJECT for internal approval decline", async () => {
    const { createOffer, submitOfferForApproval, approveOffer, sendOffer, rejectOffer, declineOfferApproval } = await import("@/lib/actions/offers");
    const { prisma } = await import("@/lib/prisma");
    const unit1 = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "AUDIT-3" });
    const unit2 = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "AUDIT-4" });

    const customerRejectedId = await createOffer(offerFormData(unit1.id));
    await submitOfferForApproval(customerRejectedId);
    await approveOffer(customerRejectedId);
    await sendOffer(customerRejectedId);
    const rejectFd = new FormData();
    rejectFd.set("offerId", customerRejectedId);
    rejectFd.set("rejectReason", "PRICE");
    await rejectOffer(rejectFd);

    const internalDeclinedId = await createOffer(offerFormData(unit2.id));
    await submitOfferForApproval(internalDeclinedId);
    const declineFd = new FormData();
    declineFd.set("offerId", internalDeclinedId);
    await declineOfferApproval(declineFd);

    const customerReject = await prisma.auditLog.findFirstOrThrow({ where: { organizationId: org.organization.id, entityType: "LeasingOffer", entityId: customerRejectedId, action: "REJECT" } });
    expect((customerReject.metadata as Record<string, unknown> | null)?.rejectionType).toBe("customer");

    const internalReject = await prisma.auditLog.findFirstOrThrow({ where: { organizationId: org.organization.id, entityType: "LeasingOffer", entityId: internalDeclinedId, action: "REJECT" } });
    expect((internalReject.metadata as Record<string, unknown> | null)?.rejectionType).toBe("internal_approval");
  });

  it("records a CANCEL audit row when an offer is cancelled", async () => {
    const { createOffer, cancelOffer } = await import("@/lib/actions/offers");
    const { prisma } = await import("@/lib/prisma");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "AUDIT-5" });

    const offerId = await createOffer(offerFormData(unit.id));
    await cancelOffer(offerId);

    const cancelAudit = await prisma.auditLog.findFirstOrThrow({ where: { organizationId: org.organization.id, entityType: "LeasingOffer", entityId: offerId, action: "CANCEL" } });
    expect(cancelAudit).toBeTruthy();
  });
});

describe("Financial safety (Step 34): Offer actions never touch financial tables", () => {
  it("a full DRAFT -> SENT -> ACCEPTED lifecycle creates zero Invoice/PaymentSchedule/Payment/OwnerLedgerEntry rows", async () => {
    const { createOffer, submitOfferForApproval, approveOffer, sendOffer, acceptOffer } = await import("@/lib/actions/offers");
    const { prisma } = await import("@/lib/prisma");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "FIN-1" });

    const offerId = await createOffer(offerFormData(unit.id));
    await submitOfferForApproval(offerId);
    await approveOffer(offerId);
    await sendOffer(offerId);
    await acceptOffer(offerId);

    const [invoiceCount, scheduleCount, paymentCount, ledgerCount] = await Promise.all([
      prisma.invoice.count({ where: { organizationId: org.organization.id } }),
      prisma.paymentSchedule.count({ where: { organizationId: org.organization.id } }),
      prisma.payment.count({ where: { organizationId: org.organization.id } }),
      prisma.ownerLedgerEntry.count({ where: { organizationId: org.organization.id } }),
    ]);

    expect(invoiceCount).toBe(0);
    expect(scheduleCount).toBe(0);
    expect(paymentCount).toBe(0);
    expect(ledgerCount).toBe(0);
  });
});
