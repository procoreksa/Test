import { prisma } from "@/lib/prisma";

/**
 * Owner-side mirror of src/lib/tenant-session-refresh.ts (itself a mirror
 * of src/lib/auth-session-refresh.ts - docs/SECURITY-REVIEW.md, "Stale
 * session / authentication boundaries"), applied to the separate
 * owner-portal JWT (src/lib/owner-auth.ts). Kept as its own module/
 * constant (not a shared import) so all three revalidation windows can be
 * tuned independently, and so a change to one principal's session policy
 * never accidentally changes another's.
 *
 * Deliberately re-verifies ONLY the OwnerPortalAccount's own status here -
 * never ownership itself. Ownership access is always re-resolved fresh,
 * per request, by the entitlement helpers in src/lib/owner-session.ts
 * (via the authoritative getEffectiveOwners() resolver) - it is never
 * cached in the JWT, so an ownership change takes effect on the very next
 * request regardless of this revalidation window (see docs/OWNER-PORTAL.md,
 * "Ownership revocation").
 */
export const OWNER_SESSION_REVALIDATE_INTERVAL_MS = 5 * 60 * 1000;

export function shouldRevalidateOwnerSession(verifiedAt: number | undefined, now: Date = new Date()): boolean {
  if (!verifiedAt) return true;
  return now.getTime() - verifiedAt >= OWNER_SESSION_REVALIDATE_INTERVAL_MS;
}

export interface RefreshedOwnerSessionClaims {
  organizationId: string;
  ownerId: string;
  email: string;
}

/**
 * Re-reads the account's current status/organization/owner from the
 * database. Returns null - which the JWT callback treats as "end this
 * session" - when the account no longer exists or is no longer ACTIVE
 * (SUSPENDED/DISABLED/INVITED all lose access immediately on the next
 * revalidation, never waiting out the JWT's own maxAge).
 */
export async function refreshOwnerSessionClaims(ownerAccountId: string): Promise<RefreshedOwnerSessionClaims | null> {
  const account = await prisma.ownerPortalAccount.findUnique({
    where: { id: ownerAccountId, status: "ACTIVE" },
    select: { organizationId: true, ownerId: true, email: true },
  });
  if (!account) return null;
  return account;
}
