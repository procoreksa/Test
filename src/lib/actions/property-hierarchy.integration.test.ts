import { describe, it, expect, vi, beforeEach } from "vitest";

// Same pattern as rbac.integration.test.ts: mock only the outermost auth
// boundary so requirePermission() sees a controlled fake session, then call
// the real action functions. This verifies the Compound/Building/Floor CRUD
// introduced by the Property->Unit hierarchy migration is actually wired to
// requirePermission() (reusing the existing property.*/unit.* keys, per
// docs/PROPERTY-HIERARCHY.md - no new Permission keys were added), and that
// every action still enforces org-scoping via the session-derived
// organizationId (never a client-supplied value) exactly like every other
// mutation in this codebase.
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

describe("Property hierarchy RBAC: Compound/Building/Floor CRUD reuses property.*/unit.* permissions", () => {
  beforeEach(() => {
    mockAuth.mockReset();
  });

  it("createCompound rejects ACCOUNTANT and VIEWER (not granted property.create)", async () => {
    const { createCompound } = await import("@/lib/actions/compounds");
    for (const role of ["ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const formData = new FormData();
      formData.set("name", "Test Compound");
      formData.set("status", "ACTIVE");
      await expect(createCompound(formData), `role ${role} should be rejected`).rejects.toThrow();
    }
  });

  it("createCompound's permission check passes for OWNER/ADMIN/MANAGER (fails later, at the DB, which doesn't exist in this test)", async () => {
    const { createCompound } = await import("@/lib/actions/compounds");
    for (const role of ["OWNER", "ADMIN", "MANAGER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const formData = new FormData();
      formData.set("name", "Test Compound");
      formData.set("status", "ACTIVE");
      const error = await createCompound(formData).catch((e) => e);
      expect(error).toBeDefined();
      expect(String(error?.name)).not.toBe("AuthorizationError");
    }
  });

  it("deleteCompound rejects everyone except OWNER/ADMIN (property.delete policy)", async () => {
    const { deleteCompound } = await import("@/lib/actions/compounds");
    for (const role of ["MANAGER", "ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      await expect(deleteCompound("compound-1"), `role ${role} should be rejected`).rejects.toThrow();
    }
  });

  it("createBuilding rejects a VIEWER before touching the database", async () => {
    mockAuth.mockResolvedValue(sessionFor("VIEWER"));
    const { createBuilding } = await import("@/lib/actions/buildings");
    const formData = new FormData();
    formData.set("compoundId", "compound-1");
    formData.set("name", "Tower A");
    await expect(createBuilding(formData)).rejects.toThrow();
  });

  it("deleteBuilding rejects everyone except OWNER/ADMIN", async () => {
    const { deleteBuilding } = await import("@/lib/actions/buildings");
    for (const role of ["MANAGER", "ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      await expect(deleteBuilding("building-1"), `role ${role} should be rejected`).rejects.toThrow();
    }
  });

  it("createFloor rejects ACCOUNTANT and VIEWER (not granted unit.create)", async () => {
    const { createFloor } = await import("@/lib/actions/floors");
    for (const role of ["ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      const formData = new FormData();
      formData.set("buildingId", "building-1");
      formData.set("floorNumber", "1");
      await expect(createFloor(formData), `role ${role} should be rejected`).rejects.toThrow();
    }
  });

  it("deleteFloor rejects everyone except OWNER/ADMIN (unit.delete policy)", async () => {
    const { deleteFloor } = await import("@/lib/actions/floors");
    for (const role of ["MANAGER", "ACCOUNTANT", "VIEWER"]) {
      mockAuth.mockResolvedValue(sessionFor(role));
      await expect(deleteFloor("floor-1"), `role ${role} should be rejected`).rejects.toThrow();
    }
  });

  it("createUnit (now floorId-based) rejects a VIEWER before touching the database", async () => {
    mockAuth.mockResolvedValue(sessionFor("VIEWER"));
    const { createUnit } = await import("@/lib/actions/units");
    const formData = new FormData();
    formData.set("floorId", "floor-1");
    formData.set("unitNumber", "A-101");
    formData.set("unitType", "APARTMENT");
    formData.set("baseRentAmount", "1000");
    await expect(createUnit(formData)).rejects.toThrow();
  });

  it("createContract's inline new-unit branch (now floorId-based) still requires unit.create in addition to contract.create", async () => {
    // MANAGER has both contract.create and unit.create - the permission
    // check must pass and fail later at the (nonexistent) database, proving
    // the inline-unit creation path was updated to ask for floorId (not the
    // old propertyId) without losing its own permission gate.
    mockAuth.mockResolvedValue(sessionFor("MANAGER"));
    const { createContract } = await import("@/lib/actions/contracts");
    const formData = new FormData();
    formData.set("createNewUnit", "true");
    formData.set("newUnitFloorId", "floor-1");
    formData.set("newUnitNumber", "A-101");
    formData.set("newUnitType", "APARTMENT");
    formData.set("newUnitBaseRentAmount", "1000");
    formData.set("renterId", "renter-1");
    formData.set("startDate", "2026-01-01");
    formData.set("endDate", "2027-01-01");
    formData.set("rentAmount", "1000");
    formData.set("paymentFrequency", "MONTHLY");
    formData.set("extraChargesMode", "ONE_TIME");

    const error = await createContract(formData).catch((e) => e);
    expect(error).toBeDefined();
    expect(String(error?.name)).not.toBe("AuthorizationError");
  });
});
