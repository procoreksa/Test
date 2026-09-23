/**
 * Shared fixtures for the Owner Portal's real-DB test suite
 * (docs/OWNER-PORTAL.md). Mirrors tenant-portal-test-helpers.ts's own
 * conventions: every helper here writes directly via Prisma (bypassing the
 * owner-portal server actions/auth), and the tests themselves exercise the
 * real actions/entitlement helpers under a mocked owner session
 * (`@/lib/owner-auth`'s `auth()`) to verify authorization and ownership
 * entitlement.
 */
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { uniqueSuffix, createTestOwner, type SeededOrg } from "./db-test-helpers";

export const TEST_OWNER_PASSWORD = "Test-Password-123!";

/** Direct Prisma write - bypasses createOwnerPortalAccount()/the admin RBAC layer, matching this suite's "build fixtures fast, test the real actions" convention. */
export async function createTestOwnerPortalAccount(
  organizationId: string,
  ownerId: string,
  createdByUserId: string,
  overrides: Partial<{ email: string; status: "INVITED" | "ACTIVE" | "SUSPENDED" | "DISABLED"; password: string }> = {}
) {
  const email = overrides.email ?? `owner-${uniqueSuffix()}@example.com`;
  const password = overrides.password ?? TEST_OWNER_PASSWORD;
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.ownerPortalAccount.create({
    data: {
      organizationId,
      ownerId,
      email,
      emailNormalized: email.toLowerCase().trim(),
      passwordHash,
      status: overrides.status ?? "ACTIVE",
      mustChangePassword: false,
      createdByUserId,
    },
  });
}

/** Session shape matching owner-auth.ts's `session()` callback, for mocking `@/lib/owner-auth`'s `auth()`. */
export function ownerSessionFor(account: { id: string; organizationId: string; ownerId: string; email: string }) {
  return { owner: { id: account.id, organizationId: account.organizationId, ownerId: account.ownerId, email: account.email } };
}

/**
 * A fresh Owner + ACTIVE OwnerPortalAccount inside an already-seeded
 * organization, plus a fresh Unit (under org's existing compound/building)
 * that this owner owns 100% at the UNIT level - everything a same-org
 * owner-isolation test needs as "Owner A"/"Owner B" alongside another
 * ownership built the same way (see docs/OWNER-PORTAL.md, "Organization
 * scoping alone is NOT sufficient").
 */
export async function seedOwnerPortalOwnership(org: SeededOrg, label: string, percentage = 100) {
  const owner = await createTestOwner(org.organization.id, `${label} Owner`);
  const unit = await prisma.unit.create({
    data: { organizationId: org.organization.id, floorId: org.floor.id, unitNumber: `${label}-${uniqueSuffix()}`, baseRentAmount: 1000, vatApplicable: false },
  });
  const ownership = await prisma.propertyOwnership.create({
    data: { organizationId: org.organization.id, ownerId: owner.id, unitId: unit.id, ownershipPercentage: percentage },
  });
  const account = await createTestOwnerPortalAccount(org.organization.id, owner.id, org.admin.id, { email: `${label.toLowerCase()}-${uniqueSuffix()}@example.com` });
  return { owner, unit, ownership, account, session: ownerSessionFor(account) };
}

export type SeededOwnerPortalOwnership = Awaited<ReturnType<typeof seedOwnerPortalOwnership>>;
