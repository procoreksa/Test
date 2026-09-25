import type { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can, type Permission } from "@/lib/permissions";

export async function requireSession() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function requireOrgId(): Promise<string> {
  const session = await requireSession();
  return session.user.organizationId;
}

/**
 * A distinct Error class so callers/tests can identify an authorization
 * failure specifically. requirePermission() itself redirects rather than
 * throwing this (see below) - kept for call sites doing their own inline
 * permission check outside requirePermission().
 */
export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** The authenticated user's role, straight from the signed session JWT - never trust a role value supplied by the client. */
export async function getCurrentUserRole(): Promise<UserRole> {
  const session = await requireSession();
  return session.user.role as UserRole;
}

/**
 * The single gate every mutating (and every sensitive-read) server action
 * or page must pass through: verifies authentication, reads the role from
 * the signed session (never from client input), and redirects to
 * /access-denied if that role doesn't grant `permission`. Returns the
 * organizationId/role together so call sites don't need a second
 * requireOrgId() call, though requireOrgId() remains available on its own
 * for the handful of paths (e.g. locale switching) that aren't
 * permission-gated at all.
 *
 * Redirects rather than throwing AuthorizationError: Next.js redacts a
 * thrown error's message once it crosses the server/client boundary in a
 * production build, so by the time an `error.tsx` boundary could inspect
 * it, an AuthorizationError is indistinguishable from any other unexpected
 * error - which is exactly the distinction a safe access-denied page
 * depends on. redirect() is Next's own routing primitive, never subject to
 * that redaction, and works identically whether requirePermission() is
 * called from a Server Component's render or from inside a Server Action.
 */
export async function requirePermission(permission: Permission): Promise<{ organizationId: string; role: UserRole }> {
  const session = await requireSession();
  const role = session.user.role as UserRole;

  if (!can(permission, role)) {
    redirect("/access-denied");
  }

  return { organizationId: session.user.organizationId, role };
}
