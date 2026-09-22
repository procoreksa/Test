/**
 * STEP 39 - real, database-backed tests for the revision/versioning chain
 * (Step 11/32) and the discount-approval threshold (Step 13), exercising
 * the actual createOffer()/reviseOffer()/approveOffer() server actions
 * against the real database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestUser, createTestUnit, type SeededOrg } from "./db-test-helpers";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeEach(async () => {
  await resetDatabase();
  org = await seedFullOrg("A");
  mockAuth.mockResolvedValue(org.session);
});

function offerFormData(overrides: { unitId: string; annualRent?: number; discountPercentage?: number }) {
  const fd = new FormData();
  fd.set("leadId", org.lead.id);
  fd.set("unitId", overrides.unitId);
  fd.set("validFrom", "2027-06-01");
  fd.set("validUntil", "2027-06-30");
  fd.set("annualRent", String(overrides.annualRent ?? 100000));
  if (overrides.discountPercentage != null) fd.set("discountPercentage", String(overrides.discountPercentage));
  fd.set("securityDeposit", "25000");
  fd.set("paymentFrequency", "QUARTERLY");
  fd.set("furnishedStatus", "UNFURNISHED");
  return fd;
}

describe("Offer versioning / revision chain (real DB)", () => {
  it("a new offer starts at version 1 with no parent", async () => {
    const { createOffer, getOfferById } = await import("@/lib/actions/offers");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "REV-1" });
    const offerId = await createOffer(offerFormData({ unitId: unit.id }));
    const offer = await getOfferById(offerId);
    expect(offer.versionNumber).toBe(1);
    expect(offer.parentOfferId).toBeNull();
  });

  it("reviseOffer creates version 2 sharing the same offerNumber, and supersedes version 1", async () => {
    const { createOffer, submitOfferForApproval, approveOffer, sendOffer, reviseOffer, getOfferById } = await import("@/lib/actions/offers");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "REV-2" });
    const v1Id = await createOffer(offerFormData({ unitId: unit.id }));
    await submitOfferForApproval(v1Id);
    await approveOffer(v1Id);
    await sendOffer(v1Id);

    const v2Id = await reviseOffer(v1Id);
    const v1 = await getOfferById(v1Id);
    const v2 = await getOfferById(v2Id);

    expect(v1.status).toBe("SUPERSEDED");
    expect(v2.status).toBe("DRAFT");
    expect(v2.versionNumber).toBe(2);
    expect(v2.offerNumber).toBe(v1.offerNumber);
    expect(v2.parentOfferId).toBe(v1Id);
  });

  it("getOfferVersionChain returns every version of the chain, oldest first", async () => {
    const { createOffer, submitOfferForApproval, approveOffer, sendOffer, reviseOffer, getOfferVersionChain } = await import("@/lib/actions/offers");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "REV-3" });
    const v1Id = await createOffer(offerFormData({ unitId: unit.id }));
    await submitOfferForApproval(v1Id);
    await approveOffer(v1Id);
    await sendOffer(v1Id);
    const v2Id = await reviseOffer(v1Id);

    const { getOfferById } = await import("@/lib/actions/offers");
    const v2 = await getOfferById(v2Id);
    const chain = await getOfferVersionChain(v2.offerNumber);

    expect(chain.map((c) => c.versionNumber)).toEqual([1, 2]);
    expect(chain[0].status).toBe("SUPERSEDED");
    expect(chain[1].status).toBe("DRAFT");
  });

  it("a Draft offer cannot be revised (only edited in place) - reviseOffer rejects it", async () => {
    const { createOffer, reviseOffer } = await import("@/lib/actions/offers");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "REV-4" });
    const offerId = await createOffer(offerFormData({ unitId: unit.id }));
    await expect(reviseOffer(offerId)).rejects.toThrow();
  });

  it("a superseded (already-revised) offer cannot be revised again - the chain stays linear", async () => {
    const { createOffer, submitOfferForApproval, approveOffer, sendOffer, reviseOffer } = await import("@/lib/actions/offers");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "REV-5" });
    const v1Id = await createOffer(offerFormData({ unitId: unit.id }));
    await submitOfferForApproval(v1Id);
    await approveOffer(v1Id);
    await sendOffer(v1Id);
    await reviseOffer(v1Id);

    await expect(reviseOffer(v1Id)).rejects.toThrow();
  });
});

describe("Cannot edit a SENT offer directly (real DB)", () => {
  it("updateOfferDraft rejects a SENT offer", async () => {
    const { createOffer, submitOfferForApproval, approveOffer, sendOffer, updateOfferDraft } = await import("@/lib/actions/offers");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "SENT-1" });
    const offerId = await createOffer(offerFormData({ unitId: unit.id }));
    await submitOfferForApproval(offerId);
    await approveOffer(offerId);
    await sendOffer(offerId);

    const fd = offerFormData({ unitId: unit.id, annualRent: 999999 });
    fd.set("offerId", offerId);
    await expect(updateOfferDraft(fd)).rejects.toThrow();

    const { prisma } = await import("@/lib/prisma");
    const stillOriginal = await prisma.leasingOffer.findUniqueOrThrow({ where: { id: offerId } });
    expect(Number(stillOriginal.annualRent)).toBe(100000);
  });

  it("updateOfferDraft allows editing while still DRAFT", async () => {
    const { createOffer, updateOfferDraft, getOfferById } = await import("@/lib/actions/offers");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "SENT-2" });
    const offerId = await createOffer(offerFormData({ unitId: unit.id }));

    const fd = offerFormData({ unitId: unit.id, annualRent: 120000 });
    fd.set("offerId", offerId);
    await updateOfferDraft(fd);

    const updated = await getOfferById(offerId);
    expect(Number(updated.annualRent)).toBe(120000);
  });
});

describe("High-discount approval restriction (real DB)", () => {
  it("MANAGER cannot approve a discount above 10%", async () => {
    const manager = await createTestUser(org.organization.id, "MANAGER");
    mockAuth.mockResolvedValue({ user: { id: manager.id, name: "Manager", email: manager.email, role: "MANAGER", organizationId: org.organization.id, organizationName: org.organization.name } });

    const { createOffer, submitOfferForApproval, approveOffer } = await import("@/lib/actions/offers");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "DISC-1" });
    const offerId = await createOffer(offerFormData({ unitId: unit.id, discountPercentage: 25 }));
    await submitOfferForApproval(offerId);

    await expect(approveOffer(offerId)).rejects.toThrow();
  });

  it("MANAGER can approve a discount at or below 10%", async () => {
    const manager = await createTestUser(org.organization.id, "MANAGER");
    mockAuth.mockResolvedValue({ user: { id: manager.id, name: "Manager", email: manager.email, role: "MANAGER", organizationId: org.organization.id, organizationName: org.organization.name } });

    const { createOffer, submitOfferForApproval, approveOffer, getOfferById } = await import("@/lib/actions/offers");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "DISC-2" });
    const offerId = await createOffer(offerFormData({ unitId: unit.id, discountPercentage: 10 }));
    await submitOfferForApproval(offerId);
    await approveOffer(offerId);

    const updated = await getOfferById(offerId);
    expect(updated.status).toBe("APPROVED");
    expect(updated.approvalStatus).toBe("APPROVED");
  });

  it("ADMIN can approve a discount above 10% that a MANAGER could not", async () => {
    const { createOffer, submitOfferForApproval, approveOffer, getOfferById } = await import("@/lib/actions/offers");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "DISC-3" });
    const offerId = await createOffer(offerFormData({ unitId: unit.id, discountPercentage: 40 }));
    await submitOfferForApproval(offerId);
    // org.session is an ADMIN (seedFullOrg's default user role)
    await approveOffer(offerId);

    const updated = await getOfferById(offerId);
    expect(updated.status).toBe("APPROVED");
  });

  it("declineOfferApproval returns the offer to DRAFT with approvalStatus REJECTED, never OfferStatus REJECTED", async () => {
    const { createOffer, submitOfferForApproval, declineOfferApproval, getOfferById } = await import("@/lib/actions/offers");
    const unit = await createTestUnit(org.organization.id, org.floor.id, { unitNumber: "DISC-4" });
    const offerId = await createOffer(offerFormData({ unitId: unit.id, discountPercentage: 5 }));
    await submitOfferForApproval(offerId);

    const fd = new FormData();
    fd.set("offerId", offerId);
    fd.set("notes", "Price too aggressive for this unit");
    await declineOfferApproval(fd);

    const updated = await getOfferById(offerId);
    expect(updated.status).toBe("DRAFT");
    expect(updated.approvalStatus).toBe("REJECTED");
  });
});
