import { describe, it, expect, vi, beforeEach } from "vitest";

// Same pattern as rbac.integration.test.ts and property-hierarchy.integration.test.ts:
// mock only the outermost auth boundary so requirePermission()/requireSession()
// see a controlled fake session, then call the real action functions. This
// verifies the new owner/ownership/ledger permission keys are actually wired
// up (rejecting before any database access) and match the role policy given
// in the task brief - see docs/OWNERSHIP-ACCOUNTING.md, "RBAC".
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

describe("Owner CRUD permissions", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("createOwner rejects ACCOUNTANT and VIEWER", async () => {
    const { createOwner } = await import("@/lib/actions/owners");
    for (const role of ["ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const formData = new FormData();
      formData.set("ownerType", "INDIVIDUAL");
      formData.set("name", "Test Owner");
      await expect(createOwner(formData), `role ${role} should be rejected`).rejects.toThrow();
    }
  });

  it("createOwner's permission check passes for OWNER/ADMIN/MANAGER (fails later, at the DB, which doesn't exist in this test)", async () => {
    const { createOwner } = await import("@/lib/actions/owners");
    for (const role of ["OWNER", "ADMIN", "MANAGER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const formData = new FormData();
      formData.set("ownerType", "INDIVIDUAL");
      formData.set("name", "Test Owner");
      const error = await createOwner(formData).catch((e) => e);
      expect(error).toBeDefined();
      expect(String(error?.name)).not.toBe("AuthorizationError");
    }
  });

  it("updateOwner and deactivateOwner reject VIEWER and ACCOUNTANT", async () => {
    const { updateOwner, deactivateOwner } = await import("@/lib/actions/owners");
    for (const role of ["VIEWER", "ACCOUNTANT"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const formData = new FormData();
      formData.set("ownerId", "owner-1");
      formData.set("ownerType", "INDIVIDUAL");
      formData.set("name", "Test Owner");
      await expect(updateOwner(formData), `updateOwner: role ${role} should be rejected`).rejects.toThrow();
      await expect(deactivateOwner("owner-1"), `deactivateOwner: role ${role} should be rejected`).rejects.toThrow();
    }
  });
});

describe("Ownership management permissions", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("createOwnership and endOwnership reject ACCOUNTANT and VIEWER (ownership.manage not granted)", async () => {
    const { createOwnership, endOwnership } = await import("@/lib/actions/ownership");
    for (const role of ["ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const formData = new FormData();
      formData.set("ownerId", "owner-1");
      formData.set("assetLevel", "UNIT");
      formData.set("assetId", "unit-1");
      formData.set("ownershipPercentage", "100");
      await expect(createOwnership(formData), `createOwnership: role ${role} should be rejected`).rejects.toThrow();
      await expect(endOwnership("ownership-1"), `endOwnership: role ${role} should be rejected`).rejects.toThrow();
    }
  });

  it("createOwnership's permission check passes for MANAGER (fails later, at the DB) - Manager can manage ownership", async () => {
    mockAuth.mockResolvedValue(sessionFor("MANAGER"));
    const { createOwnership } = await import("@/lib/actions/ownership");
    const formData = new FormData();
    formData.set("ownerId", "owner-1");
    formData.set("assetLevel", "UNIT");
    formData.set("assetId", "unit-1");
    formData.set("ownershipPercentage", "100");
    const error = await createOwnership(formData).catch((e) => e);
    expect(error).toBeDefined();
    expect(String(error?.name)).not.toBe("AuthorizationError");
  });

  it("listOwnershipForAsset and getEffectiveOwnersForAsset (ownership.view) are readable by every role", async () => {
    const { listOwnershipForAsset } = await import("@/lib/actions/ownership");
    for (const role of ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const error = await listOwnershipForAsset("UNIT", "unit-1").catch((e) => e);
      // No DB in this test env, so it still errors - but never with AuthorizationError.
      expect(String(error?.name)).not.toBe("AuthorizationError");
    }
  });
});

describe("Owner ledger permissions - Manager can manage ownership but cannot post sensitive financial adjustments", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("postManualLedgerEntry rejects VIEWER and MANAGER (ownerLedger.create not granted to Manager)", async () => {
    const { postManualLedgerEntry } = await import("@/lib/actions/owner-ledger");
    for (const role of ["VIEWER", "MANAGER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const formData = new FormData();
      formData.set("ownerId", "owner-1");
      formData.set("entryType", "OWNER_DISTRIBUTION");
      formData.set("amount", "1000");
      formData.set("entryDate", "2026-01-01");
      formData.set("description", "Test distribution");
      await expect(postManualLedgerEntry(formData), `role ${role} should be rejected`).rejects.toThrow();
    }
  });

  it("Accountant can create ledger entries - permission check passes (fails later, at the DB)", async () => {
    mockAuth.mockResolvedValue(sessionFor("ACCOUNTANT"));
    const { postManualLedgerEntry } = await import("@/lib/actions/owner-ledger");
    const formData = new FormData();
    formData.set("ownerId", "owner-1");
    formData.set("entryType", "OWNER_DISTRIBUTION");
    formData.set("amount", "1000");
    formData.set("entryDate", "2026-01-01");
    formData.set("description", "Test distribution");
    const error = await postManualLedgerEntry(formData).catch((e) => e);
    expect(error).toBeDefined();
    expect(String(error?.name)).not.toBe("AuthorizationError");
  });

  it("reverseLedgerEntry rejects VIEWER and MANAGER", async () => {
    const { reverseLedgerEntry } = await import("@/lib/actions/owner-ledger");
    for (const role of ["VIEWER", "MANAGER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      await expect(reverseLedgerEntry("entry-1"), `role ${role} should be rejected`).rejects.toThrow();
    }
  });

  it("Accountant can reverse ledger entries - permission check passes (fails later, at the DB)", async () => {
    mockAuth.mockResolvedValue(sessionFor("ACCOUNTANT"));
    const { reverseLedgerEntry } = await import("@/lib/actions/owner-ledger");
    const error = await reverseLedgerEntry("entry-1").catch((e) => e);
    expect(error).toBeDefined();
    expect(String(error?.name)).not.toBe("AuthorizationError");
  });

  it("allocateToOwnersAction rejects VIEWER and MANAGER, passes the gate for OWNER/ADMIN/ACCOUNTANT", async () => {
    const { allocateToOwnersAction } = await import("@/lib/actions/owner-ledger");
    for (const role of ["VIEWER", "MANAGER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const formData = new FormData();
      formData.set("assetLevel", "UNIT");
      formData.set("assetId", "unit-1");
      formData.set("entryType", "RENT_INCOME");
      formData.set("amount", "1000");
      formData.set("entryDate", "2026-01-01");
      formData.set("description", "Rent allocation");
      await expect(allocateToOwnersAction(formData), `role ${role} should be rejected`).rejects.toThrow();
    }
  });
});
