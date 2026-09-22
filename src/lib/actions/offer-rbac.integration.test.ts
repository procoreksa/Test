import { describe, it, expect, vi, beforeEach } from "vitest";

// Same pattern as viewing-rbac.integration.test.ts: mock only the NextAuth
// boundary so requireSession()/requirePermission() see a controlled fake
// session, while everything downstream (permission checks, the action's own
// logic) runs for real.
const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

function sessionFor(role: string) {
  return {
    user: {
      id: "user-1",
      name: "Test User",
      email: "test@example.com",
      role,
      organizationId: "org-1",
      organizationName: "Test Org",
    },
  };
}

function newOfferFormData() {
  const fd = new FormData();
  fd.set("leadId", "lead-1");
  fd.set("unitId", "unit-1");
  fd.set("validFrom", "2026-06-01");
  fd.set("validUntil", "2026-06-15");
  fd.set("annualRent", "80000");
  fd.set("securityDeposit", "20000");
  fd.set("paymentFrequency", "QUARTERLY");
  fd.set("furnishedStatus", "UNFURNISHED");
  return fd;
}

describe("Offer RBAC integration: offer server actions reject unauthorized roles", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("createOffer rejects ACCOUNTANT and VIEWER before touching the database", async () => {
    const { createOffer } = await import("@/lib/actions/offers");
    for (const role of ["ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      await expect(createOffer(newOfferFormData()), `role ${role} should be rejected`).rejects.toThrow();
    }
  });

  it("createOffer's permission check passes for OWNER, ADMIN, MANAGER (fails later, at the DB, which doesn't exist in this test)", async () => {
    const { createOffer } = await import("@/lib/actions/offers");
    for (const role of ["OWNER", "ADMIN", "MANAGER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const error = await createOffer(newOfferFormData()).catch((e) => e);
      expect(error).toBeDefined();
      expect(String(error?.name)).not.toBe("AuthorizationError");
    }
  });

  it("updateOfferDraft rejects ACCOUNTANT and VIEWER", async () => {
    const { updateOfferDraft } = await import("@/lib/actions/offers");
    for (const role of ["ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const fd = newOfferFormData();
      fd.set("offerId", "offer-1");
      await expect(updateOfferDraft(fd), `role ${role} should be rejected`).rejects.toThrow();
    }
  });

  it("submitOfferForApproval rejects ACCOUNTANT and VIEWER", async () => {
    const { submitOfferForApproval } = await import("@/lib/actions/offers");
    for (const role of ["ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      await expect(submitOfferForApproval("offer-1"), `role ${role} should be rejected`).rejects.toThrow();
    }
  });

  it("approveOffer and declineOfferApproval reject ACCOUNTANT and VIEWER", async () => {
    const { approveOffer, declineOfferApproval } = await import("@/lib/actions/offers");
    for (const role of ["ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      await expect(approveOffer("offer-1"), `approve: role ${role}`).rejects.toThrow();
      const fd = new FormData();
      fd.set("offerId", "offer-1");
      await expect(declineOfferApproval(fd), `decline: role ${role}`).rejects.toThrow();
    }
  });

  it("approveOffer's permission check passes for MANAGER (fails later, at the DB)", async () => {
    const { approveOffer } = await import("@/lib/actions/offers");
    mockAuth.mockResolvedValue(sessionFor("MANAGER"));
    const error = await approveOffer("offer-1").catch((e) => e);
    expect(error).toBeDefined();
    expect(String(error?.name)).not.toBe("AuthorizationError");
  });

  it("sendOffer rejects ACCOUNTANT and VIEWER", async () => {
    const { sendOffer } = await import("@/lib/actions/offers");
    for (const role of ["ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      await expect(sendOffer("offer-1"), `role ${role} should be rejected`).rejects.toThrow();
    }
  });

  it("acceptOffer and rejectOffer reject ACCOUNTANT and VIEWER", async () => {
    const { acceptOffer, rejectOffer } = await import("@/lib/actions/offers");
    for (const role of ["ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      await expect(acceptOffer("offer-1"), `accept: role ${role}`).rejects.toThrow();
      const fd = new FormData();
      fd.set("offerId", "offer-1");
      fd.set("rejectReason", "PRICE");
      await expect(rejectOffer(fd), `reject: role ${role}`).rejects.toThrow();
    }
  });

  it("cancelOffer and reviseOffer reject ACCOUNTANT and VIEWER", async () => {
    const { cancelOffer, reviseOffer } = await import("@/lib/actions/offers");
    for (const role of ["ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      await expect(cancelOffer("offer-1"), `cancel: role ${role}`).rejects.toThrow();
      await expect(reviseOffer("offer-1"), `revise: role ${role}`).rejects.toThrow();
    }
  });

  it("listOffers (offer.view) passes the gate for every role except ACCOUNTANT", async () => {
    const { listOffers } = await import("@/lib/actions/offers");
    for (const role of ["OWNER", "ADMIN", "MANAGER", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const error = await listOffers({}).catch((e) => e);
      expect(error).toBeDefined();
      expect(String(error?.name)).not.toBe("AuthorizationError");
    }
  });

  it("listOffers rejects ACCOUNTANT (no offer access at all, per the brief - matches its existing lead.*/viewing.* policy)", async () => {
    const { listOffers } = await import("@/lib/actions/offers");
    mockAuth.mockResolvedValue(sessionFor("ACCOUNTANT"));
    await expect(listOffers({})).rejects.toThrow();
  });

  it("getOfferDashboardStats rejects ACCOUNTANT", async () => {
    const { getOfferDashboardStats } = await import("@/lib/actions/offer-reports");
    mockAuth.mockResolvedValue(sessionFor("ACCOUNTANT"));
    await expect(getOfferDashboardStats()).rejects.toThrow();
  });
});
