/**
 * Real, database-backed tests for the Owner Portal's own login rule
 * (verifyOwnerCredentials(), src/lib/owner-credentials.ts) and its
 * stale-session hardening (refreshOwnerSessionClaims(),
 * src/lib/owner-session-refresh.ts). Mirrors tenant-portal-auth.db.test.ts's
 * own precedent exactly. Proves: only an ACTIVE account with the correct
 * password ever succeeds; INVITED/SUSPENDED/DISABLED/wrong-password/
 * nonexistent-account all fail identically (no email-enumeration signal); a
 * suspended/disabled account loses access immediately on the next
 * revalidation, not at the end of its JWT's maxAge.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { resetDatabase, seedFullOrg, createTestOwner, type SeededOrg } from "./db-test-helpers";
import { createTestOwnerPortalAccount, TEST_OWNER_PASSWORD } from "./owner-portal-test-helpers";
import { prisma } from "@/lib/prisma";
import { verifyOwnerCredentials } from "@/lib/owner-credentials";
import { refreshOwnerSessionClaims } from "@/lib/owner-session-refresh";

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("OWNAUTHX");
});

describe("verifyOwnerCredentials", () => {
  it("succeeds for an ACTIVE account with the correct password, and updates lastLoginAt", async () => {
    const owner = await createTestOwner(org.organization.id, "Auth Success Owner");
    const account = await createTestOwnerPortalAccount(org.organization.id, owner.id, org.admin.id, { status: "ACTIVE" });
    const result = await verifyOwnerCredentials(account.email, TEST_OWNER_PASSWORD);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(account.id);
    expect(result?.organizationId).toBe(org.organization.id);
    expect(result?.ownerId).toBe(owner.id);

    const updated = await prisma.ownerPortalAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(updated.lastLoginAt).not.toBeNull();

    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityType: "OwnerSession", entityId: account.id, action: "LOGIN" } });
    expect(log.userRole).toBe("OWNER_PORTAL");
  });

  it("is case-insensitive and trims the email", async () => {
    const owner = await createTestOwner(org.organization.id, "Case Test Owner");
    const account = await createTestOwnerPortalAccount(org.organization.id, owner.id, org.admin.id, { status: "ACTIVE", email: "Case.Owner@Example.com" });
    const result = await verifyOwnerCredentials("  CASE.OWNER@EXAMPLE.COM  ", TEST_OWNER_PASSWORD);
    expect(result?.id).toBe(account.id);
  });

  it("fails for an ACTIVE account with the wrong password, and lastLoginAt stays unchanged", async () => {
    const owner = await createTestOwner(org.organization.id, "Wrong Password Owner");
    const account = await createTestOwnerPortalAccount(org.organization.id, owner.id, org.admin.id, { status: "ACTIVE" });
    const result = await verifyOwnerCredentials(account.email, "not-the-real-password");
    expect(result).toBeNull();
    const unchanged = await prisma.ownerPortalAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(unchanged.lastLoginAt).toBeNull();
  });

  it("fails for an INVITED account, even with the correct password", async () => {
    const owner = await createTestOwner(org.organization.id, "Invited Owner");
    const account = await createTestOwnerPortalAccount(org.organization.id, owner.id, org.admin.id, { status: "INVITED" });
    expect(await verifyOwnerCredentials(account.email, TEST_OWNER_PASSWORD)).toBeNull();
  });

  it("fails for a SUSPENDED account, even with the correct password", async () => {
    const owner = await createTestOwner(org.organization.id, "Suspended Owner");
    const account = await createTestOwnerPortalAccount(org.organization.id, owner.id, org.admin.id, { status: "SUSPENDED" });
    expect(await verifyOwnerCredentials(account.email, TEST_OWNER_PASSWORD)).toBeNull();
  });

  it("fails for a DISABLED account, even with the correct password", async () => {
    const owner = await createTestOwner(org.organization.id, "Disabled Owner");
    const account = await createTestOwnerPortalAccount(org.organization.id, owner.id, org.admin.id, { status: "DISABLED" });
    expect(await verifyOwnerCredentials(account.email, TEST_OWNER_PASSWORD)).toBeNull();
  });

  it("fails for a nonexistent email, identically to an inactive account", async () => {
    expect(await verifyOwnerCredentials("no-such-owner@example.com", "whatever")).toBeNull();
  });
});

describe("refreshOwnerSessionClaims: stale-session hardening", () => {
  it("returns fresh claims for a still-ACTIVE account", async () => {
    const owner = await createTestOwner(org.organization.id, "Refresh Active Owner");
    const account = await createTestOwnerPortalAccount(org.organization.id, owner.id, org.admin.id, { status: "ACTIVE" });
    const fresh = await refreshOwnerSessionClaims(account.id);
    expect(fresh).not.toBeNull();
    expect(fresh?.organizationId).toBe(org.organization.id);
    expect(fresh?.ownerId).toBe(owner.id);
  });

  it("returns null once the account is SUSPENDED - an existing session loses access on the next revalidation, not at maxAge", async () => {
    const owner = await createTestOwner(org.organization.id, "Refresh Suspend Owner");
    const account = await createTestOwnerPortalAccount(org.organization.id, owner.id, org.admin.id, { status: "ACTIVE" });
    expect(await refreshOwnerSessionClaims(account.id)).not.toBeNull();

    await prisma.ownerPortalAccount.update({ where: { id: account.id }, data: { status: "SUSPENDED" } });
    expect(await refreshOwnerSessionClaims(account.id)).toBeNull();
  });

  it("returns null once the account is DISABLED", async () => {
    const owner = await createTestOwner(org.organization.id, "Refresh Disable Owner");
    const account = await createTestOwnerPortalAccount(org.organization.id, owner.id, org.admin.id, { status: "ACTIVE" });
    await prisma.ownerPortalAccount.update({ where: { id: account.id }, data: { status: "DISABLED" } });
    expect(await refreshOwnerSessionClaims(account.id)).toBeNull();
  });

  it("returns null for an account id that no longer exists", async () => {
    expect(await refreshOwnerSessionClaims("nonexistent-owner-account-id")).toBeNull();
  });
});
