/**
 * Real, database-backed tests for the internal (staff-side) Tenant Portal
 * account administration actions (src/lib/actions/tenant-portal-account.ts).
 * These are gated by ordinary internal RBAC (requirePermission), completely
 * separate from anything a tenant can do to their own account. Proves the
 * account lifecycle (INVITED -> ACTIVE -> SUSPENDED/DISABLED, DISABLED
 * terminal), that a suspended/disabled account is immediately blocked from
 * logging in, that password reset issues a genuinely new credential, and
 * that staff in one organization cannot administer another organization's
 * tenant accounts.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";
import { verifyTenantCredentials } from "@/lib/tenant-credentials";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

let orgA: SeededOrg;
let orgB: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  orgA = await seedFullOrg("ADMX-A");
  orgB = await seedFullOrg("ADMX-B");
});

beforeEach(() => {
  mockAuth.mockReset();
  mockAuth.mockResolvedValue(orgA.session);
});

describe("createTenantPortalAccount", () => {
  it("creates an INVITED account and returns a one-time temporary password that actually authenticates once the account is later activated", async () => {
    const { createTenantPortalAccount, activateTenantPortalAccount } = await import("@/lib/actions/tenant-portal-account");
    const { accountId, temporaryPassword } = await createTenantPortalAccount(fd({ renterId: orgA.renter.id, email: "invited-tenant@example.com" }));

    const created = await prisma.tenantPortalAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(created.status).toBe("INVITED");
    expect(created.mustChangePassword).toBe(true);

    // INVITED cannot log in yet.
    expect(await verifyTenantCredentials("invited-tenant@example.com", temporaryPassword)).toBeNull();

    await activateTenantPortalAccount(fd({ accountId }));
    const activated = await prisma.tenantPortalAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(activated.status).toBe("ACTIVE");

    const login = await verifyTenantCredentials("invited-tenant@example.com", temporaryPassword);
    expect(login?.id).toBe(accountId);
  });

  it("rejects a second account for a renter that already has one", async () => {
    const { createTenantPortalAccount } = await import("@/lib/actions/tenant-portal-account");
    const renter = await prisma.renter.create({ data: { organizationId: orgA.organization.id, fullName: "Second Account Renter" } });
    await createTenantPortalAccount(fd({ renterId: renter.id, email: `dup-${Date.now()}@example.com` }));
    await expect(createTenantPortalAccount(fd({ renterId: renter.id, email: `dup2-${Date.now()}@example.com` }))).rejects.toThrow();
  });

  it("rejects a duplicate email within the same organization", async () => {
    const { createTenantPortalAccount } = await import("@/lib/actions/tenant-portal-account");
    const renter2 = await prisma.renter.create({ data: { organizationId: orgA.organization.id, fullName: "Dup Email Renter" } });
    const sharedEmail = `shared-${Date.now()}@example.com`;
    await createTenantPortalAccount(fd({ renterId: renter2.id, email: sharedEmail }));
    const renter3 = await prisma.renter.create({ data: { organizationId: orgA.organization.id, fullName: "Dup Email Renter 2" } });
    await expect(createTenantPortalAccount(fd({ renterId: renter3.id, email: sharedEmail }))).rejects.toThrow();
  });
});

describe("Account status transitions", () => {
  it("only allows the transitions ACCOUNT_TRANSITIONS actually permits", async () => {
    const { createTenantPortalAccount, activateTenantPortalAccount, suspendTenantPortalAccount, disableTenantPortalAccount } = await import("@/lib/actions/tenant-portal-account");
    const renter = await prisma.renter.create({ data: { organizationId: orgA.organization.id, fullName: "Transitions Renter" } });
    const { accountId } = await createTenantPortalAccount(fd({ renterId: renter.id, email: `transitions-${Date.now()}@example.com` }));

    // INVITED -> ACTIVE is valid.
    await activateTenantPortalAccount(fd({ accountId }));
    expect((await prisma.tenantPortalAccount.findUniqueOrThrow({ where: { id: accountId } })).status).toBe("ACTIVE");

    // ACTIVE -> ACTIVE (re-activating an already-active account) is not a
    // permitted transition.
    await expect(activateTenantPortalAccount(fd({ accountId }))).rejects.toThrow();

    // ACTIVE -> SUSPENDED is valid.
    await suspendTenantPortalAccount(fd({ accountId }));
    expect((await prisma.tenantPortalAccount.findUniqueOrThrow({ where: { id: accountId } })).status).toBe("SUSPENDED");

    // SUSPENDED -> ACTIVE (reactivation) is valid.
    await activateTenantPortalAccount(fd({ accountId }));
    expect((await prisma.tenantPortalAccount.findUniqueOrThrow({ where: { id: accountId } })).status).toBe("ACTIVE");

    // ACTIVE -> DISABLED is valid, and DISABLED is terminal.
    await disableTenantPortalAccount(fd({ accountId }));
    expect((await prisma.tenantPortalAccount.findUniqueOrThrow({ where: { id: accountId } })).status).toBe("DISABLED");
    await expect(activateTenantPortalAccount(fd({ accountId }))).rejects.toThrow();
  });

  it("suspending an account immediately blocks login, even with the correct password", async () => {
    const { createTenantPortalAccount, activateTenantPortalAccount, suspendTenantPortalAccount } = await import("@/lib/actions/tenant-portal-account");
    const renter = await prisma.renter.create({ data: { organizationId: orgA.organization.id, fullName: "Suspend Login Renter" } });
    const email = `suspend-login-${Date.now()}@example.com`;
    const { accountId, temporaryPassword } = await createTenantPortalAccount(fd({ renterId: renter.id, email }));
    await activateTenantPortalAccount(fd({ accountId }));
    expect(await verifyTenantCredentials(email, temporaryPassword)).not.toBeNull();

    await suspendTenantPortalAccount(fd({ accountId }));
    expect(await verifyTenantCredentials(email, temporaryPassword)).toBeNull();
  });
});

describe("resetTenantPortalAccountPassword", () => {
  it("issues a genuinely new credential - the old password stops working, the new one works", async () => {
    const { createTenantPortalAccount, activateTenantPortalAccount, resetTenantPortalAccountPassword } = await import("@/lib/actions/tenant-portal-account");
    const renter = await prisma.renter.create({ data: { organizationId: orgA.organization.id, fullName: "Reset Password Renter" } });
    const email = `reset-${Date.now()}@example.com`;
    const { accountId, temporaryPassword: oldPassword } = await createTenantPortalAccount(fd({ renterId: renter.id, email }));
    await activateTenantPortalAccount(fd({ accountId }));

    const { temporaryPassword: newPassword } = await resetTenantPortalAccountPassword(fd({ accountId }));
    expect(newPassword).not.toBe(oldPassword);
    expect(await verifyTenantCredentials(email, oldPassword)).toBeNull();
    expect((await verifyTenantCredentials(email, newPassword))?.id).toBe(accountId);

    const updated = await prisma.tenantPortalAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(updated.mustChangePassword).toBe(true);
  });
});

describe("Cross-organization isolation: Org B staff cannot administer Org A's tenant accounts", () => {
  it("getTenantPortalAccountForRenter returns null for Org A's renterId when called as Org B staff", async () => {
    const { createTenantPortalAccount, getTenantPortalAccountForRenter } = await import("@/lib/actions/tenant-portal-account");
    const renter = await prisma.renter.create({ data: { organizationId: orgA.organization.id, fullName: "Cross Org Admin Renter" } });
    await createTenantPortalAccount(fd({ renterId: renter.id, email: `crossorg-${Date.now()}@example.com` }));

    mockAuth.mockResolvedValue(orgB.session);
    const result = await getTenantPortalAccountForRenter(renter.id);
    expect(result).toBeNull();
  });

  it("activate/suspend/disable/resetPassword all reject an accountId belonging to Org A", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { createTenantPortalAccount } = await import("@/lib/actions/tenant-portal-account");
    const renter = await prisma.renter.create({ data: { organizationId: orgA.organization.id, fullName: "Cross Org Action Renter" } });
    const { accountId } = await createTenantPortalAccount(fd({ renterId: renter.id, email: `crossorgaction-${Date.now()}@example.com` }));

    mockAuth.mockResolvedValue(orgB.session);
    const { activateTenantPortalAccount, suspendTenantPortalAccount, disableTenantPortalAccount, resetTenantPortalAccountPassword } = await import("@/lib/actions/tenant-portal-account");
    await expect(activateTenantPortalAccount(fd({ accountId }))).rejects.toThrow();
    await expect(suspendTenantPortalAccount(fd({ accountId }))).rejects.toThrow();
    await expect(disableTenantPortalAccount(fd({ accountId }))).rejects.toThrow();
    await expect(resetTenantPortalAccountPassword(fd({ accountId }))).rejects.toThrow();

    const stillInvited = await prisma.tenantPortalAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(stillInvited.status).toBe("INVITED");
  });
});
