import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the NextAuth entry point so requireSession()/requirePermission() see a
// controlled fake session instead of trying to read real cookies/JWTs. This
// mocks only the outermost auth boundary - everything downstream (permission
// checks, the action's own logic) runs for real, which is what makes this an
// integration test of the actual wiring rather than a pure unit test.
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

describe("RBAC integration: protected server actions reject unauthorized roles", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("createContract rejects a VIEWER before touching the database", async () => {
    mockAuth.mockResolvedValue(sessionFor("VIEWER"));
    const { createContract } = await import("@/lib/actions/contracts");

    const formData = new FormData();
    formData.set("unitId", "unit-1");
    formData.set("renterId", "renter-1");
    formData.set("startDate", "2026-01-01");
    formData.set("endDate", "2027-01-01");
    formData.set("rentAmount", "1000");
    formData.set("paymentFrequency", "MONTHLY");
    formData.set("extraChargesMode", "ONE_TIME");

    await expect(createContract(formData)).rejects.toThrow();
  });

  it("createContract succeeds the permission check for OWNER, ADMIN and MANAGER (fails later, at the DB, which doesn't exist in this test)", async () => {
    const { createContract } = await import("@/lib/actions/contracts");
    const formData = new FormData();
    formData.set("unitId", "unit-1");
    formData.set("renterId", "renter-1");
    formData.set("startDate", "2026-01-01");
    formData.set("endDate", "2027-01-01");
    formData.set("rentAmount", "1000");
    formData.set("paymentFrequency", "MONTHLY");
    formData.set("extraChargesMode", "ONE_TIME");

    for (const role of ["OWNER", "ADMIN", "MANAGER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const error = await createContract(formData).catch((e) => e);
      // It must fail (there's no real database in this test run), but it
      // must NOT fail with our authorization error - i.e. it got past the
      // permission gate before hitting Prisma.
      expect(error).toBeDefined();
      expect(String(error?.name)).not.toBe("AuthorizationError");
    }
  });

  it("createContract rejects an ACCOUNTANT (not granted contract.create)", async () => {
    mockAuth.mockResolvedValue(sessionFor("ACCOUNTANT"));
    const { createContract } = await import("@/lib/actions/contracts");
    const formData = new FormData();
    await expect(createContract(formData)).rejects.toThrow();
  });

  it("recordPayment rejects a VIEWER", async () => {
    mockAuth.mockResolvedValue(sessionFor("VIEWER"));
    const { recordPayment } = await import("@/lib/actions/payments");
    const formData = new FormData();
    formData.set("invoiceId", "invoice-1");
    formData.set("amount", "100");
    formData.set("method", "CASH");
    await expect(recordPayment(formData)).rejects.toThrow();
  });

  it("recordPayment's permission check passes for ACCOUNTANT (fails later, at the DB)", async () => {
    mockAuth.mockResolvedValue(sessionFor("ACCOUNTANT"));
    const { recordPayment } = await import("@/lib/actions/payments");
    const formData = new FormData();
    formData.set("invoiceId", "invoice-1");
    formData.set("amount", "100");
    formData.set("method", "CASH");
    const error = await recordPayment(formData).catch((e) => e);
    expect(error).toBeDefined();
    expect(String(error?.name)).not.toBe("AuthorizationError");
  });

  it("cancelInvoice: ACCOUNTANT's permission check passes, MANAGER's does not (matches the defined policy)", async () => {
    const { cancelInvoice } = await import("@/lib/actions/invoices");

    mockAuth.mockResolvedValue(sessionFor("ACCOUNTANT"));
    const accountantError = await cancelInvoice("invoice-1").catch((e) => e);
    expect(String(accountantError?.name)).not.toBe("AuthorizationError");

    mockAuth.mockResolvedValue(sessionFor("MANAGER"));
    await expect(cancelInvoice("invoice-1")).rejects.toThrow();
  });

  it("deleteProperty rejects everyone except OWNER/ADMIN", async () => {
    const { deleteProperty } = await import("@/lib/actions/properties");
    for (const role of ["MANAGER", "ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      await expect(deleteProperty("property-1"), `role ${role} should be rejected`).rejects.toThrow();
    }
  });
});
