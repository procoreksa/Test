import type { UserRole } from "@prisma/client";
import { auth } from "@/lib/auth";
import { getLocale, getDictionary } from "@/lib/i18n";
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
 * Thrown by requirePermission() when the authenticated user's role does not
 * grant the requested permission. A distinct class (rather than a bare
 * Error) so callers/tests can identify an authorization failure
 * specifically, e.g. `error instanceof AuthorizationError`.
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
 * must pass through: verifies authentication, reads the role from the
 * signed session (never from client input), and throws a bilingual
 * AuthorizationError if that role doesn't grant `permission`. Returns the
 * organizationId/role together so call sites don't need a second
 * requireOrgId() call, though requireOrgId() remains available on its own
 * for the handful of paths (e.g. locale switching) that aren't
 * permission-gated at all.
 */
export async function requirePermission(permission: Permission): Promise<{ organizationId: string; role: UserRole }> {
  const session = await requireSession();
  const role = session.user.role as UserRole;

  if (!can(permission, role)) {
    const t = getDictionary(await getLocale());
    throw new AuthorizationError(t.validation.notAuthorized);
  }

  return { organizationId: session.user.organizationId, role };
}
