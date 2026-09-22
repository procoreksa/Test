/**
 * STEP 33 - real, database-backed cross-organization security and IDOR
 * tests for Leasing Offer Management, following the exact pattern
 * established in viewing-cross-org-security.db.test.ts: two real
 * organizations, real Admin users, only the NextAuth session boundary
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

describe("Offer cross-organization isolation: Admin A cannot read/modify Organization B's offers", () => {
  it("cannot read Offer B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { getOfferById } = await import("@/lib/actions/offers");
    await expect(getOfferById(orgB.offer.id)).rejects.toThrow();
  });

  it("cannot edit/submit Offer B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { updateOfferDraft, submitOfferForApproval } = await import("@/lib/actions/offers");
    const fd = new FormData();
    fd.set("offerId", orgB.offer.id);
    fd.set("leadId", orgA.lead.id);
    fd.set("unitId", orgA.unit.id);
    fd.set("validFrom", "2027-06-01");
    fd.set("validUntil", "2027-06-15");
    fd.set("annualRent", "80000");
    fd.set("securityDeposit", "20000");
    fd.set("paymentFrequency", "QUARTERLY");
    fd.set("furnishedStatus", "UNFURNISHED");
    await expect(updateOfferDraft(fd)).rejects.toThrow();
    await expect(submitOfferForApproval(orgB.offer.id)).rejects.toThrow();
  });

  it("cannot approve/decline Offer B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { approveOffer, declineOfferApproval } = await import("@/lib/actions/offers");
    await expect(approveOffer(orgB.offer.id)).rejects.toThrow();
    const fd = new FormData();
    fd.set("offerId", orgB.offer.id);
    await expect(declineOfferApproval(fd)).rejects.toThrow();
  });

  it("cannot send Offer B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { sendOffer } = await import("@/lib/actions/offers");
    await expect(sendOffer(orgB.offer.id)).rejects.toThrow();
  });

  it("cannot accept or reject Offer B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { acceptOffer, rejectOffer } = await import("@/lib/actions/offers");
    await expect(acceptOffer(orgB.offer.id)).rejects.toThrow();
    const fd = new FormData();
    fd.set("offerId", orgB.offer.id);
    fd.set("rejectReason", "PRICE");
    await expect(rejectOffer(fd)).rejects.toThrow();

    const { prisma } = await import("@/lib/prisma");
    const stillDraft = await prisma.leasingOffer.findUniqueOrThrow({ where: { id: orgB.offer.id } });
    expect(stillDraft.status).toBe("DRAFT");
  });

  it("cannot cancel or revise Offer B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { cancelOffer, reviseOffer } = await import("@/lib/actions/offers");
    await expect(cancelOffer(orgB.offer.id)).rejects.toThrow();
    await expect(reviseOffer(orgB.offer.id)).rejects.toThrow();
  });

  it("Org A's offer list never contains Org B's offers", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { listOffers } = await import("@/lib/actions/offers");
    const { rows } = await listOffers({});
    expect(rows.some((o) => o.id === orgB.offer.id)).toBe(false);
  });
});

describe("Offer IDOR: direct cross-org id substitution is rejected on creation", () => {
  function baseFormData(overrides: Partial<{ leadId: string; unitId: string; assignedToUserId: string; viewingId: string }> = {}) {
    const fd = new FormData();
    fd.set("leadId", overrides.leadId ?? orgA.lead.id);
    fd.set("unitId", overrides.unitId ?? orgA.unit.id);
    if (overrides.assignedToUserId) fd.set("assignedToUserId", overrides.assignedToUserId);
    if (overrides.viewingId) fd.set("viewingId", overrides.viewingId);
    fd.set("validFrom", "2027-06-01");
    fd.set("validUntil", "2027-06-15");
    fd.set("annualRent", "80000");
    fd.set("securityDeposit", "20000");
    fd.set("paymentFrequency", "QUARTERLY");
    fd.set("furnishedStatus", "UNFURNISHED");
    return fd;
  }

  it("cannot create an offer attaching Lead B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createOffer } = await import("@/lib/actions/offers");
    await expect(createOffer(baseFormData({ leadId: orgB.lead.id }))).rejects.toThrow();
  });

  it("cannot create an offer attaching Unit B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createOffer } = await import("@/lib/actions/offers");
    await expect(createOffer(baseFormData({ unitId: orgB.unit.id }))).rejects.toThrow();
  });

  it("cannot create an offer assigning User B as the agent", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createOffer } = await import("@/lib/actions/offers");
    await expect(createOffer(baseFormData({ assignedToUserId: orgB.admin.id }))).rejects.toThrow();
  });

  it("cannot create an offer attaching Viewing B", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createOffer } = await import("@/lib/actions/offers");
    await expect(createOffer(baseFormData({ viewingId: orgB.viewing.id }))).rejects.toThrow();
  });
});

describe("Offer cross-organization isolation: reverse direction (Admin B against Organization A)", () => {
  it("cannot read or accept Offer A", async () => {
    mockAuth.mockResolvedValue(orgB.session);
    const { getOfferById, acceptOffer } = await import("@/lib/actions/offers");
    await expect(getOfferById(orgA.offer.id)).rejects.toThrow();
    await expect(acceptOffer(orgA.offer.id)).rejects.toThrow();
  });
});

describe("Offer IDOR: positive control", () => {
  it("Admin A can create an offer assigning another Org A user as agent", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createOffer } = await import("@/lib/actions/offers");
    const secondUser = await createTestUser(orgA.organization.id, "MANAGER");

    const fd = new FormData();
    fd.set("leadId", orgA.lead.id);
    fd.set("unitId", orgA.unit.id);
    fd.set("assignedToUserId", secondUser.id);
    fd.set("validFrom", "2027-07-01");
    fd.set("validUntil", "2027-07-15");
    fd.set("annualRent", "90000");
    fd.set("securityDeposit", "22500");
    fd.set("paymentFrequency", "QUARTERLY");
    fd.set("furnishedStatus", "UNFURNISHED");

    const offerId = await createOffer(fd);
    expect(offerId).toBeTruthy();
  });
});
