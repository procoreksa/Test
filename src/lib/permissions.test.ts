import { describe, it, expect } from "vitest";
import { can, ROLE_PERMISSIONS, type Permission } from "@/lib/permissions";
import type { UserRole } from "@prisma/client";

const ALL_ROLES: UserRole[] = ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT", "VIEWER"];

describe("can()", () => {
  it("OWNER can create a contract", () => {
    expect(can("contract.create", "OWNER")).toBe(true);
  });

  it("ADMIN can create a contract", () => {
    expect(can("contract.create", "ADMIN")).toBe(true);
  });

  it("MANAGER can create a contract", () => {
    expect(can("contract.create", "MANAGER")).toBe(true);
  });

  it("ACCOUNTANT cannot create a contract", () => {
    expect(can("contract.create", "ACCOUNTANT")).toBe(false);
  });

  it("VIEWER cannot create a contract", () => {
    expect(can("contract.create", "VIEWER")).toBe(false);
  });

  it("ACCOUNTANT can record a payment", () => {
    expect(can("payment.create", "ACCOUNTANT")).toBe(true);
  });

  it("VIEWER cannot record a payment", () => {
    expect(can("payment.create", "VIEWER")).toBe(false);
  });

  it("ACCOUNTANT can cancel an invoice", () => {
    expect(can("invoice.cancel", "ACCOUNTANT")).toBe(true);
  });

  it("MANAGER cannot cancel an invoice (not in MANAGER's granted policy)", () => {
    expect(can("invoice.cancel", "MANAGER")).toBe(false);
  });

  it("VIEWER can read reports", () => {
    expect(can("report.view", "VIEWER")).toBe(true);
  });

  it("VIEWER cannot mutate any data", () => {
    const mutatingPermissions: Permission[] = [
      "property.create",
      "property.update",
      "property.delete",
      "unit.create",
      "unit.delete",
      "renter.create",
      "renter.delete",
      "contract.create",
      "contract.update",
      "contract.renew",
      "contract.terminate",
      "invoice.create",
      "invoice.cancel",
      "payment.create",
      "settings.update",
    ];
    for (const permission of mutatingPermissions) {
      expect(can(permission, "VIEWER"), `VIEWER should not have ${permission}`).toBe(false);
    }
  });

  it("OWNER and ADMIN have every defined permission", () => {
    const allPermissions = Object.values(ROLE_PERMISSIONS.OWNER);
    for (const permission of allPermissions as Permission[]) {
      expect(can(permission, "OWNER")).toBe(true);
      expect(can(permission, "ADMIN")).toBe(true);
    }
  });

  it("ACCOUNTANT cannot create/edit/delete/renew/terminate contracts, properties, units or renters", () => {
    const forbidden: Permission[] = [
      "property.create",
      "property.update",
      "property.delete",
      "unit.create",
      "unit.update",
      "unit.delete",
      "renter.create",
      "renter.update",
      "renter.delete",
      "contract.create",
      "contract.update",
      "contract.renew",
      "contract.terminate",
      "settings.update",
    ];
    for (const permission of forbidden) {
      expect(can(permission, "ACCOUNTANT"), `ACCOUNTANT should not have ${permission}`).toBe(false);
    }
  });

  it("every role has a non-empty permission set, and no role has a permission outside the full set", () => {
    const fullSet = new Set(ROLE_PERMISSIONS.OWNER);
    for (const role of ALL_ROLES) {
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(fullSet.has(permission)).toBe(true);
      }
    }
  });
});
