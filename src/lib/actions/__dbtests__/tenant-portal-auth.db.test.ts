/**
 * Real, database-backed tests for the Tenant Portal's own login rule
 * (verifyTenantCredentials(), extracted from src/lib/tenant-auth.ts's
 * Credentials provider) and its stale-session hardening
 * (refreshTenantSessionClaims(), src/lib/tenant-session-refresh.ts).
 * Mirrors this codebase's established convention (src/lib/actions/
 * __dbtests__/auth-session-refresh.db.test.ts) of testing security-critical
 * login/session logic directly, without going through NextAuth's HTTP
 * layer. Proves: only an ACTIVE account with the correct password ever
 * succeeds; INVITED/SUSPENDED/DISABLED/wrong-password/nonexistent-account
 * all fail identically (Step 57 - no email-enumeration signal); a
 * suspended/disabled account loses access immediately on the next
 * revalidation, not at the end of its JWT's maxAge (Step 7).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { resetDatabase, seedFullOrg, type SeededOrg } from "./db-test-helpers";
import { createTestTenantAccount, TEST_TENANT_PASSWORD } from "./tenant-portal-test-helpers";
import { prisma } from "@/lib/prisma";
import { verifyTenantCredentials } from "@/lib/tenant-credentials";
import { refreshTenantSessionClaims } from "@/lib/tenant-session-refresh";

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("AUTHX");
});

describe("verifyTenantCredentials", () => {
  it("succeeds for an ACTIVE account with the correct password, and updates lastLoginAt", async () => {
    const account = await createTestTenantAccount(org.organization.id, org.renter.id, org.admin.id, { status: "ACTIVE" });
    const result = await verifyTenantCredentials(account.email, TEST_TENANT_PASSWORD);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(account.id);
    expect(result?.organizationId).toBe(org.organization.id);
    expect(result?.renterId).toBe(org.renter.id);

    const updated = await prisma.tenantPortalAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(updated.lastLoginAt).not.toBeNull();

    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityType: "TenantSession", entityId: account.id, action: "LOGIN" } });
    expect(log.userRole).toBe("TENANT");
  });

  it("is case-insensitive and trims the email", async () => {
    const renter = await prisma.renter.create({ data: { organizationId: org.organization.id, fullName: "Case Test Renter" } });
    const account = await createTestTenantAccount(org.organization.id, renter.id, org.admin.id, { status: "ACTIVE", email: "Case.Test@Example.com" });
    const result = await verifyTenantCredentials("  CASE.TEST@EXAMPLE.COM  ", TEST_TENANT_PASSWORD);
    expect(result?.id).toBe(account.id);
  });

  it("fails for an ACTIVE account with the wrong password, and lastLoginAt stays unchanged", async () => {
    const renter = await prisma.renter.create({ data: { organizationId: org.organization.id, fullName: "Wrong Password Renter" } });
    const account = await createTestTenantAccount(org.organization.id, renter.id, org.admin.id, { status: "ACTIVE" });
    const result = await verifyTenantCredentials(account.email, "not-the-real-password");
    expect(result).toBeNull();
    const unchanged = await prisma.tenantPortalAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(unchanged.lastLoginAt).toBeNull();
  });

  it("fails for an INVITED account, even with the correct password", async () => {
    const renter = await prisma.renter.create({ data: { organizationId: org.organization.id, fullName: "Invited Renter" } });
    const account = await createTestTenantAccount(org.organization.id, renter.id, org.admin.id, { status: "INVITED" });
    expect(await verifyTenantCredentials(account.email, TEST_TENANT_PASSWORD)).toBeNull();
  });

  it("fails for a SUSPENDED account, even with the correct password", async () => {
    const renter = await prisma.renter.create({ data: { organizationId: org.organization.id, fullName: "Suspended Renter" } });
    const account = await createTestTenantAccount(org.organization.id, renter.id, org.admin.id, { status: "SUSPENDED" });
    expect(await verifyTenantCredentials(account.email, TEST_TENANT_PASSWORD)).toBeNull();
  });

  it("fails for a DISABLED account, even with the correct password", async () => {
    const renter = await prisma.renter.create({ data: { organizationId: org.organization.id, fullName: "Disabled Renter" } });
    const account = await createTestTenantAccount(org.organization.id, renter.id, org.admin.id, { status: "DISABLED" });
    expect(await verifyTenantCredentials(account.email, TEST_TENANT_PASSWORD)).toBeNull();
  });

  it("fails for a nonexistent email, identically to an inactive account", async () => {
    expect(await verifyTenantCredentials("no-such-tenant@example.com", "whatever")).toBeNull();
  });
});

describe("refreshTenantSessionClaims: stale-session hardening", () => {
  it("returns fresh claims for a still-ACTIVE account", async () => {
    const renter = await prisma.renter.create({ data: { organizationId: org.organization.id, fullName: "Refresh Active Renter" } });
    const account = await createTestTenantAccount(org.organization.id, renter.id, org.admin.id, { status: "ACTIVE" });
    const fresh = await refreshTenantSessionClaims(account.id);
    expect(fresh).not.toBeNull();
    expect(fresh?.organizationId).toBe(org.organization.id);
    expect(fresh?.renterId).toBe(renter.id);
  });

  it("returns null once the account is SUSPENDED - an existing session loses access on the next revalidation, not at maxAge", async () => {
    const renter = await prisma.renter.create({ data: { organizationId: org.organization.id, fullName: "Refresh Suspend Renter" } });
    const account = await createTestTenantAccount(org.organization.id, renter.id, org.admin.id, { status: "ACTIVE" });
    expect(await refreshTenantSessionClaims(account.id)).not.toBeNull();

    await prisma.tenantPortalAccount.update({ where: { id: account.id }, data: { status: "SUSPENDED" } });
    expect(await refreshTenantSessionClaims(account.id)).toBeNull();
  });

  it("returns null once the account is DISABLED", async () => {
    const renter = await prisma.renter.create({ data: { organizationId: org.organization.id, fullName: "Refresh Disable Renter" } });
    const account = await createTestTenantAccount(org.organization.id, renter.id, org.admin.id, { status: "ACTIVE" });
    await prisma.tenantPortalAccount.update({ where: { id: account.id }, data: { status: "DISABLED" } });
    expect(await refreshTenantSessionClaims(account.id)).toBeNull();
  });

  it("returns null for an account id that no longer exists", async () => {
    expect(await refreshTenantSessionClaims("nonexistent-tenant-account-id")).toBeNull();
  });
});
