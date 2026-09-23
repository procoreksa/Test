import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * The Tenant Portal's login rule and its audit trail - deliberately kept in
 * its own module, separate from src/lib/tenant-auth.ts (which constructs
 * the actual NextAuth instance and therefore pulls in `next-auth`/
 * `next/server`). Mirrors this codebase's established split between
 * src/lib/auth.ts and src/lib/auth-session-refresh.ts: a real-DB test can
 * import this module directly without ever loading `next-auth`, which
 * fails outside an actual Next.js server runtime (`next/server` isn't
 * resolvable under plain Node/vitest).
 */

export async function auditTenantLoginEvent(params: {
  action: "LOGIN" | "LOGIN_FAILED" | "LOGOUT";
  organizationId: string;
  tenantAccountId?: string | null;
  email?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: params.organizationId,
        // Plain, untyped strings (AuditLog.userId/userEmail/userRole are
        // all nullable String columns, never FKs) - a tenant actor is
        // represented here without fabricating an internal User row. See
        // docs/TENANT-PORTAL.md, "Tenant activity vs internal audit".
        userId: params.tenantAccountId ?? null,
        userEmail: params.email ?? null,
        userRole: "TENANT",
        action: params.action,
        entityType: "TenantSession",
        entityId: params.tenantAccountId ?? params.email ?? "unknown",
        metadata: params.metadata as Prisma.InputJsonValue,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      },
    });
  } catch {
    // Never let audit logging break authentication itself.
  }
}

export function requestMetadata(request?: Request) {
  if (!request) return { ipAddress: null, userAgent: null };
  const forwardedFor = request.headers.get("x-forwarded-for");
  return {
    ipAddress: forwardedFor ? forwardedFor.split(",")[0].trim() : null,
    userAgent: request.headers.get("user-agent"),
  };
}

export interface TenantCredentialAuthResult {
  id: string;
  organizationId: string;
  renterId: string;
  email: string;
}

/**
 * The actual login rule (Step 57/72). INVITED/SUSPENDED/DISABLED, a
 * nonexistent account, and a wrong password all fail identically (null) -
 * no signal distinguishes them (Step 57 - no email-enumeration signal).
 */
export async function verifyTenantCredentials(
  email: string,
  password: string,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {}
): Promise<TenantCredentialAuthResult | null> {
  const normalizedEmail = email.toLowerCase().trim();
  const account = await prisma.tenantPortalAccount.findFirst({ where: { emailNormalized: normalizedEmail } });

  if (!account || account.status !== "ACTIVE") {
    if (account) {
      await auditTenantLoginEvent({
        action: "LOGIN_FAILED",
        organizationId: account.organizationId,
        tenantAccountId: account.id,
        email: account.email,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        metadata: { reason: "inactive_account" },
      });
    }
    return null;
  }

  const valid = await bcrypt.compare(password, account.passwordHash);
  if (!valid) {
    await auditTenantLoginEvent({ action: "LOGIN_FAILED", organizationId: account.organizationId, tenantAccountId: account.id, email: account.email, ipAddress: meta.ipAddress, userAgent: meta.userAgent });
    return null;
  }

  await prisma.tenantPortalAccount.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });
  await auditTenantLoginEvent({ action: "LOGIN", organizationId: account.organizationId, tenantAccountId: account.id, email: account.email, ipAddress: meta.ipAddress, userAgent: meta.userAgent });

  return { id: account.id, organizationId: account.organizationId, renterId: account.renterId, email: account.email };
}
