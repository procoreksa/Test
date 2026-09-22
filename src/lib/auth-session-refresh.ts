import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";

/**
 * Hardening (docs/SECURITY-REVIEW.md, "Stale session / authentication
 * boundaries"): this codebase uses NextAuth's JWT session strategy
 * (src/lib/auth.ts) - the role/organizationId embedded in the signed
 * cookie are set ONCE at sign-in and, before this fix, were never
 * re-checked against the database again for the life of the session
 * (NextAuth's default JWT maxAge is 30 days). That meant deactivating a
 * user, changing their role, or renaming their organization had no effect
 * on a browser that already held a valid session cookie until it expired
 * or the user explicitly signed out.
 *
 * This module bounds that staleness window without adding a database
 * round trip to every single request: the JWT callback only re-verifies
 * once per SESSION_REVALIDATE_INTERVAL_MS, using a `verifiedAt` timestamp
 * carried in the token itself. Kept dependency-free from `next-auth`
 * itself so it can be unit-tested directly without exercising NextAuth's
 * own machinery.
 */
export const SESSION_REVALIDATE_INTERVAL_MS = 5 * 60 * 1000;

/** Pure - whether enough time has passed since the last DB re-verification to warrant another one. `now` is injectable for deterministic tests. */
export function shouldRevalidateSession(verifiedAt: number | undefined, now: Date = new Date()): boolean {
  if (!verifiedAt) return true;
  return now.getTime() - verifiedAt >= SESSION_REVALIDATE_INTERVAL_MS;
}

export interface RefreshedSessionClaims {
  role: UserRole;
  organizationId: string;
  organizationName: string;
}

/**
 * Re-reads the user's current role/organization from the database. Returns
 * null when the user no longer exists or has been deactivated
 * (`isActive: false`) - the JWT callback treats null as "end this
 * session," so a deactivated user is signed out the next time their
 * session is due for revalidation rather than staying signed in.
 */
export async function refreshSessionClaims(userId: string): Promise<RefreshedSessionClaims | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId, isActive: true },
    include: { organization: { select: { name: true } } },
  });
  if (!user) return null;
  return { role: user.role, organizationId: user.organizationId, organizationName: user.organization.name };
}
