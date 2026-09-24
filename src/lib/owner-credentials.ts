import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { checkAndRecordLoginAttempt } from "@/lib/login-rate-limiter";

/**
 * The Owner Portal's login rule and its audit trail - deliberately kept in
 * its own module, separate from src/lib/owner-auth.ts (which constructs
 * the actual NextAuth instance and therefore pulls in `next-auth`/
 * `next/server`). Mirrors src/lib/tenant-credentials.ts's own split
 * (itself mirroring src/lib/auth-session-refresh.ts's precedent): a
 * real-DB test can import this module directly without ever loading
 * `next-auth`, which fails outside an actual Next.js server runtime.
 */

export async function auditOwnerLoginEvent(params: {
  action: "LOGIN" | "LOGIN_FAILED" | "LOGOUT";
  organizationId: string;
  ownerAccountId?: string | null;
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
        // all nullable String columns, never FKs) - an owner actor is
        // represented here without fabricating an internal User row,
        // mirroring the tenant convention (docs/TENANT-PORTAL.md, "Tenant
        // activity vs internal audit").
        userId: params.ownerAccountId ?? null,
        userEmail: params.email ?? null,
        userRole: "OWNER_PORTAL",
        action: params.action,
        entityType: "OwnerSession",
        entityId: params.ownerAccountId ?? params.email ?? "unknown",
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

export interface OwnerCredentialAuthResult {
  id: string;
  organizationId: string;
  ownerId: string;
  email: string;
}

/**
 * The actual login rule, mirroring verifyTenantCredentials() exactly.
 * INVITED/SUSPENDED/DISABLED, a nonexistent account, and a wrong password
 * all fail identically (null) - no signal distinguishes them (no
 * email-enumeration signal).
 */
export async function verifyOwnerCredentials(
  email: string,
  password: string,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {}
): Promise<OwnerCredentialAuthResult | null> {
  const normalizedEmail = email.toLowerCase().trim();

  // Hardening (Prompt 23 - login rate limiting): checked before any
  // account lookup/bcrypt.compare() - a throttled attempt fails exactly
  // like any other rejection (a bare `return null`), preserving the "no
  // email-enumeration signal" property documented above.
  const { limited } = await checkAndRecordLoginAttempt({ principalType: "OWNER", identifier: normalizedEmail, ipAddress: meta.ipAddress ?? null });
  if (limited) return null;

  const account = await prisma.ownerPortalAccount.findFirst({ where: { emailNormalized: normalizedEmail } });

  if (!account || account.status !== "ACTIVE") {
    if (account) {
      await auditOwnerLoginEvent({
        action: "LOGIN_FAILED",
        organizationId: account.organizationId,
        ownerAccountId: account.id,
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
    await auditOwnerLoginEvent({ action: "LOGIN_FAILED", organizationId: account.organizationId, ownerAccountId: account.id, email: account.email, ipAddress: meta.ipAddress, userAgent: meta.userAgent });
    return null;
  }

  await prisma.ownerPortalAccount.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });
  await auditOwnerLoginEvent({ action: "LOGIN", organizationId: account.organizationId, ownerAccountId: account.id, email: account.email, ipAddress: meta.ipAddress, userAgent: meta.userAgent });

  return { id: account.id, organizationId: account.organizationId, ownerId: account.ownerId, email: account.email };
}
