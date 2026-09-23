/**
 * Shared fixtures for the Tenant Portal's real-DB test suite (docs/TENANT-
 * PORTAL.md). Mirrors db-test-helpers.ts's own conventions: every helper
 * here writes directly via Prisma (bypassing the tenant-portal server
 * actions/auth), and the tests themselves exercise the real actions under a
 * mocked tenant session (`@/lib/tenant-auth`'s `auth()`) to verify
 * authorization and entitlement.
 */
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { uniqueSuffix, createTestContract, type SeededOrg } from "./db-test-helpers";

export const TEST_TENANT_PASSWORD = "Test-Password-123!";

/** Direct Prisma write - bypasses createTenantPortalAccount()/the admin RBAC layer, matching this suite's "build fixtures fast, test the real actions" convention. */
export async function createTestTenantAccount(
  organizationId: string,
  renterId: string,
  createdByUserId: string,
  overrides: Partial<{ email: string; status: "INVITED" | "ACTIVE" | "SUSPENDED" | "DISABLED"; password: string }> = {}
) {
  const email = overrides.email ?? `tenant-${uniqueSuffix()}@example.com`;
  const password = overrides.password ?? TEST_TENANT_PASSWORD;
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.tenantPortalAccount.create({
    data: {
      organizationId,
      renterId,
      email,
      emailNormalized: email.toLowerCase().trim(),
      passwordHash,
      status: overrides.status ?? "ACTIVE",
      mustChangePassword: false,
      createdByUserId,
    },
  });
}

/** Session shape matching tenant-auth.ts's `session()` callback, for mocking `@/lib/tenant-auth`'s `auth()`. */
export function tenantSessionFor(account: { id: string; organizationId: string; renterId: string; email: string }) {
  return { tenant: { id: account.id, organizationId: account.organizationId, renterId: account.renterId, email: account.email } };
}

/**
 * A second, independent tenancy inside an already-seeded organization: a
 * fresh Renter (never org.renter), a fresh ACTIVE Contract+schedule (never
 * org.unit), and an ACTIVE TenantPortalAccount for that renter - everything
 * a same-org tenant-isolation test needs as "Tenant B" alongside another
 * tenancy built the same way as "Tenant A" (see docs/TENANT-PORTAL.md,
 * "Organization scoping alone is NOT sufficient").
 */
export async function seedTenancy(org: SeededOrg, label: string) {
  const renter = await prisma.renter.create({ data: { organizationId: org.organization.id, fullName: `${label} Renter`, email: `${label.toLowerCase()}-${uniqueSuffix()}@example.com` } });
  const { unit, contract } = await createTestContract(org, { unitNumber: `${label}-${uniqueSuffix()}`, renterId: renter.id });
  const account = await createTestTenantAccount(org.organization.id, renter.id, org.admin.id, { email: `${label.toLowerCase()}-${uniqueSuffix()}@example.com` });
  return { renter, unit, contract, account, session: tenantSessionFor(account) };
}

export type SeededTenancy = Awaited<ReturnType<typeof seedTenancy>>;
