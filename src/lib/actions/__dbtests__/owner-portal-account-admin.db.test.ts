/**
 * Real, database-backed tests for the internal (staff-side) Owner Portal
 * account administration actions (src/lib/actions/owner-portal-account.ts).
 * These are gated by ordinary internal RBAC (requirePermission), completely
 * separate from anything an owner can do to their own account. Mirrors
 * tenant-portal-account-admin.db.test.ts's own precedent exactly. Proves
 * the account lifecycle (INVITED -> ACTIVE -> SUSPENDED/DISABLED, DISABLED
 * terminal), that a suspended/disabled account is immediately blocked from
 * logging in, that password reset issues a genuinely new credential, and
 * that staff in one organization cannot administer another organization's
 * owner accounts.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestOwner, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";
import { verifyOwnerCredentials } from "@/lib/owner-credentials";

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
  orgA = await seedFullOrg("OWNADMX-A");
  orgB = await seedFullOrg("OWNADMX-B");
});

beforeEach(() => {
  mockAuth.mockReset();
  mockAuth.mockResolvedValue(orgA.session);
});

describe("createOwnerPortalAccount", () => {
  it("creates an INVITED account and returns a one-time temporary password that actually authenticates once the account is later activated", async () => {
    const owner = await createTestOwner(orgA.organization.id, "Invited Admin Owner");
    const { createOwnerPortalAccount, activateOwnerPortalAccount } = await import("@/lib/actions/owner-portal-account");
    const { accountId, temporaryPassword } = (await createOwnerPortalAccount(fd({ ownerId: owner.id, email: "invited-owner@example.com" }))) as Required<Awaited<ReturnType<typeof createOwnerPortalAccount>>>;

    const created = await prisma.ownerPortalAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(created.status).toBe("INVITED");
    expect(created.mustChangePassword).toBe(true);

    // INVITED cannot log in yet.
    expect(await verifyOwnerCredentials("invited-owner@example.com", temporaryPassword)).toBeNull();

    await activateOwnerPortalAccount(fd({ accountId }));
    const activated = await prisma.ownerPortalAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(activated.status).toBe("ACTIVE");

    const login = await verifyOwnerCredentials("invited-owner@example.com", temporaryPassword);
    expect(login?.id).toBe(accountId);
  });

  it("rejects a second account for an owner that already has one", async () => {
    const owner = await createTestOwner(orgA.organization.id, "Second Account Owner");
    const { createOwnerPortalAccount } = await import("@/lib/actions/owner-portal-account");
    await createOwnerPortalAccount(fd({ ownerId: owner.id, email: `dup-${Date.now()}@example.com` }));
    // Returned as {error}, not thrown - a thrown Server Action error's
    // message is redacted by Next.js in a genuine production build (see
    // the comment in deleteUnit(), src/lib/actions/units.ts).
    const result = await createOwnerPortalAccount(fd({ ownerId: owner.id, email: `dup2-${Date.now()}@example.com` }));
    expect(result.error).toBeTruthy();
  });

  it("rejects a duplicate email within the same organization", async () => {
    const owner2 = await createTestOwner(orgA.organization.id, "Dup Email Owner");
    const { createOwnerPortalAccount } = await import("@/lib/actions/owner-portal-account");
    const sharedEmail = `shared-${Date.now()}@example.com`;
    await createOwnerPortalAccount(fd({ ownerId: owner2.id, email: sharedEmail }));
    const owner3 = await createTestOwner(orgA.organization.id, "Dup Email Owner 2");
    const result = await createOwnerPortalAccount(fd({ ownerId: owner3.id, email: sharedEmail }));
    expect(result.error).toBeTruthy();
  });
});

describe("Account status transitions", () => {
  it("only allows the transitions ACCOUNT_TRANSITIONS actually permits", async () => {
    const owner = await createTestOwner(orgA.organization.id, "Transitions Owner");
    const { createOwnerPortalAccount, activateOwnerPortalAccount, suspendOwnerPortalAccount, disableOwnerPortalAccount } = await import("@/lib/actions/owner-portal-account");
    const { accountId } = (await createOwnerPortalAccount(fd({ ownerId: owner.id, email: `transitions-${Date.now()}@example.com` }))) as Required<Awaited<ReturnType<typeof createOwnerPortalAccount>>>;

    // INVITED -> ACTIVE is valid.
    await activateOwnerPortalAccount(fd({ accountId }));
    expect((await prisma.ownerPortalAccount.findUniqueOrThrow({ where: { id: accountId } })).status).toBe("ACTIVE");

    // ACTIVE -> ACTIVE (re-activating an already-active account) is not a
    // permitted transition.
    await expect(activateOwnerPortalAccount(fd({ accountId }))).rejects.toThrow();

    // ACTIVE -> SUSPENDED is valid.
    await suspendOwnerPortalAccount(fd({ accountId }));
    expect((await prisma.ownerPortalAccount.findUniqueOrThrow({ where: { id: accountId } })).status).toBe("SUSPENDED");

    // SUSPENDED -> ACTIVE (reactivation) is valid.
    await activateOwnerPortalAccount(fd({ accountId }));
    expect((await prisma.ownerPortalAccount.findUniqueOrThrow({ where: { id: accountId } })).status).toBe("ACTIVE");

    // ACTIVE -> DISABLED is valid, and DISABLED is terminal.
    await disableOwnerPortalAccount(fd({ accountId }));
    expect((await prisma.ownerPortalAccount.findUniqueOrThrow({ where: { id: accountId } })).status).toBe("DISABLED");
    await expect(activateOwnerPortalAccount(fd({ accountId }))).rejects.toThrow();
  });

  it("suspending an account immediately blocks login, even with the correct password", async () => {
    const owner = await createTestOwner(orgA.organization.id, "Suspend Login Owner");
    const { createOwnerPortalAccount, activateOwnerPortalAccount, suspendOwnerPortalAccount } = await import("@/lib/actions/owner-portal-account");
    const email = `suspend-login-${Date.now()}@example.com`;
    const { accountId, temporaryPassword } = (await createOwnerPortalAccount(fd({ ownerId: owner.id, email }))) as Required<Awaited<ReturnType<typeof createOwnerPortalAccount>>>;
    await activateOwnerPortalAccount(fd({ accountId }));
    expect(await verifyOwnerCredentials(email, temporaryPassword)).not.toBeNull();

    await suspendOwnerPortalAccount(fd({ accountId }));
    expect(await verifyOwnerCredentials(email, temporaryPassword)).toBeNull();
  });
});

describe("resetOwnerPortalAccountPassword", () => {
  it("issues a genuinely new credential - the old password stops working, the new one works", async () => {
    const owner = await createTestOwner(orgA.organization.id, "Reset Password Owner");
    const { createOwnerPortalAccount, activateOwnerPortalAccount, resetOwnerPortalAccountPassword } = await import("@/lib/actions/owner-portal-account");
    const email = `reset-${Date.now()}@example.com`;
    const { accountId, temporaryPassword: oldPassword } = (await createOwnerPortalAccount(fd({ ownerId: owner.id, email }))) as Required<Awaited<ReturnType<typeof createOwnerPortalAccount>>>;
    await activateOwnerPortalAccount(fd({ accountId }));

    const { temporaryPassword: newPassword } = (await resetOwnerPortalAccountPassword(fd({ accountId }))) as Required<Awaited<ReturnType<typeof resetOwnerPortalAccountPassword>>>;
    expect(newPassword).not.toBe(oldPassword);
    expect(await verifyOwnerCredentials(email, oldPassword)).toBeNull();
    expect((await verifyOwnerCredentials(email, newPassword))?.id).toBe(accountId);

    const updated = await prisma.ownerPortalAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(updated.mustChangePassword).toBe(true);
  });
});

describe("Cross-organization isolation: Org B staff cannot administer Org A's owner accounts", () => {
  it("getOwnerPortalAccountForOwner returns null for Org A's ownerId when called as Org B staff", async () => {
    const owner = await createTestOwner(orgA.organization.id, "Cross Org Admin Owner");
    const { createOwnerPortalAccount, getOwnerPortalAccountForOwner } = await import("@/lib/actions/owner-portal-account");
    await createOwnerPortalAccount(fd({ ownerId: owner.id, email: `crossorg-${Date.now()}@example.com` }));

    mockAuth.mockResolvedValue(orgB.session);
    const result = await getOwnerPortalAccountForOwner(owner.id);
    expect(result).toBeNull();
  });

  it("activate/suspend/disable/resetPassword all reject an accountId belonging to Org A", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const owner = await createTestOwner(orgA.organization.id, "Cross Org Action Owner");
    const { createOwnerPortalAccount } = await import("@/lib/actions/owner-portal-account");
    const { accountId } = (await createOwnerPortalAccount(fd({ ownerId: owner.id, email: `crossorgaction-${Date.now()}@example.com` }))) as Required<Awaited<ReturnType<typeof createOwnerPortalAccount>>>;

    mockAuth.mockResolvedValue(orgB.session);
    const { activateOwnerPortalAccount, suspendOwnerPortalAccount, disableOwnerPortalAccount, resetOwnerPortalAccountPassword } = await import("@/lib/actions/owner-portal-account");
    await expect(activateOwnerPortalAccount(fd({ accountId }))).rejects.toThrow();
    await expect(suspendOwnerPortalAccount(fd({ accountId }))).rejects.toThrow();
    await expect(disableOwnerPortalAccount(fd({ accountId }))).rejects.toThrow();
    // Returned as {error}, not thrown - see the comment above.
    const resetResult = await resetOwnerPortalAccountPassword(fd({ accountId }));
    expect(resetResult.error).toBeTruthy();

    const stillInvited = await prisma.ownerPortalAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(stillInvited.status).toBe("INVITED");
  });
});
