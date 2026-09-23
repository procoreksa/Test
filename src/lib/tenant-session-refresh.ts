import { prisma } from "@/lib/prisma";

/**
 * Tenant-side mirror of src/lib/auth-session-refresh.ts (docs/SECURITY-
 * REVIEW.md, "Stale session / authentication boundaries"), applied to the
 * separate tenant-portal JWT (src/lib/tenant-auth.ts). Kept as its own
 * module/constant (not a shared import) so the two revalidation windows can
 * be tuned independently, and so a change to internal staff session policy
 * never accidentally changes tenant session policy or vice versa.
 */
export const TENANT_SESSION_REVALIDATE_INTERVAL_MS = 5 * 60 * 1000;

export function shouldRevalidateTenantSession(verifiedAt: number | undefined, now: Date = new Date()): boolean {
  if (!verifiedAt) return true;
  return now.getTime() - verifiedAt >= TENANT_SESSION_REVALIDATE_INTERVAL_MS;
}

export interface RefreshedTenantSessionClaims {
  organizationId: string;
  renterId: string;
  email: string;
}

/**
 * Re-reads the account's current status/organization/renter from the
 * database. Returns null - which the JWT callback treats as "end this
 * session" - when the account no longer exists or is no longer ACTIVE
 * (SUSPENDED/DISABLED/INVITED all lose access immediately on the next
 * revalidation, never waiting out the JWT's own maxAge).
 */
export async function refreshTenantSessionClaims(tenantAccountId: string): Promise<RefreshedTenantSessionClaims | null> {
  const account = await prisma.tenantPortalAccount.findUnique({
    where: { id: tenantAccountId, status: "ACTIVE" },
    select: { organizationId: true, renterId: true, email: true },
  });
  if (!account) return null;
  return account;
}
