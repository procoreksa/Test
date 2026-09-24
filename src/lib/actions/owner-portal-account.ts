"use server";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";
import { auditCreate, auditAction } from "@/lib/audit";
import type { OwnerPortalAccountStatus } from "@prisma/client";

/**
 * Internal (staff-side) administration of Owner Portal accounts - mirrors
 * src/lib/actions/tenant-portal-account.ts exactly (Owner Portal spec Step
 * 78-81: "Follow Tenant Portal precedent unless architecture requires
 * otherwise"). Every action here is gated by `requirePermission("ownerPortalAccount.*")`,
 * the ordinary internal RBAC gate, since these are actions an internal
 * employee performs on behalf of an owner - completely distinct from
 * anything an owner can do to their own account (that boundary lives in
 * src/lib/owner-session.ts / src/app/owner-portal/**). No public
 * self-registration exists anywhere.
 */

const ACCOUNT_TRANSITIONS: Record<OwnerPortalAccountStatus, readonly OwnerPortalAccountStatus[]> = {
  INVITED: ["ACTIVE"],
  ACTIVE: ["SUSPENDED", "DISABLED"],
  // Reversible - staff may reactivate a suspended account.
  SUSPENDED: ["ACTIVE", "DISABLED"],
  // Terminal in practice, same as Tenant Portal - no reactivation path from
  // here; a genuinely mistaken disablement is a rare, deliberate future
  // exception, not a routine UI action.
  DISABLED: [],
};

function generateTemporaryPassword(): string {
  // 12 mixed-case/digit characters - readable enough to hand to an owner
  // over a phone call/in person, strong enough for a one-time credential
  // that mustChangePassword forces replacing on first login.
  return randomBytes(9).toString("base64url");
}

export async function getOwnerPortalAccountForOwner(ownerId: string) {
  const { organizationId } = await requirePermission("ownerPortalAccount.view");
  return prisma.ownerPortalAccount.findFirst({
    where: { organizationId, ownerId },
    select: { id: true, email: true, phone: true, status: true, lastLoginAt: true, mustChangePassword: true, createdAt: true },
  });
}

const createSchema = z.object({
  ownerId: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
});

export interface CreateOwnerAccountResult {
  error?: string;
  accountId?: string;
  temporaryPassword?: string;
}

/**
 * No email-delivery infrastructure exists in this codebase, so this never
 * pretends to send an invitation email. It generates a temporary
 * credential server-side and returns it to the caller exactly once - the
 * calling UI is responsible for displaying it to the admin a single time
 * (see the Owner profile page integration) and never persists or logs it
 * anywhere. The account starts INVITED, not ACTIVE - login is blocked
 * (src/lib/owner-auth.ts's authorize() rejects any non-ACTIVE status)
 * until a separate, deliberate activateOwnerPortalAccount() call, giving
 * staff a review step between "credential generated" and "owner can
 * actually sign in".
 */
export async function createOwnerPortalAccount(formData: FormData): Promise<CreateOwnerAccountResult> {
  const { organizationId } = await requirePermission("ownerPortalAccount.create");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());
  const parsed = createSchema.parse({
    ownerId: formData.get("ownerId"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
  });

  // Returned, not thrown - see the comment in deleteUnit() (units.ts): a
  // thrown Server Action error's message is redacted by Next.js in a
  // genuine production build once the action is invoked as a plain async
  // call rather than a <form>'s own native `action`.
  const owner = await prisma.owner.findFirst({ where: { id: parsed.ownerId, organizationId } });
  if (!owner) return { error: t.ownerPortal.ownerNotFound };

  const existing = await prisma.ownerPortalAccount.findUnique({ where: { ownerId: parsed.ownerId } });
  if (existing) return { error: t.ownerPortal.accountAlreadyExists };

  const emailNormalized = parsed.email.toLowerCase().trim();
  const dup = await prisma.ownerPortalAccount.findUnique({ where: { organizationId_emailNormalized: { organizationId, emailNormalized } } });
  if (dup) return { error: t.ownerPortal.emailAlreadyInUse };

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  const accountId = await prisma.$transaction(async (tx) => {
    const account = await tx.ownerPortalAccount.create({
      data: {
        organizationId,
        ownerId: parsed.ownerId,
        email: parsed.email,
        emailNormalized,
        phone: parsed.phone,
        passwordHash,
        status: "INVITED",
        mustChangePassword: true,
        createdByUserId: user.id,
      },
    });
    await auditCreate(tx, {
      entityType: "OwnerPortalAccount",
      entityId: account.id,
      entityDisplayName: account.email,
      newValues: { ownerId: parsed.ownerId, email: parsed.email, status: "INVITED" },
    });
    return account.id;
  });

  revalidatePath(`/owners/${parsed.ownerId}`);
  return { accountId, temporaryPassword };
}

async function transitionAccount(accountId: string, permission: Parameters<typeof requirePermission>[0], to: OwnerPortalAccountStatus, extra?: Record<string, unknown>) {
  const { organizationId } = await requirePermission(permission);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const ownerId = await prisma.$transaction(async (tx) => {
    const account = await tx.ownerPortalAccount.findFirst({ where: { id: accountId, organizationId } });
    if (!account) throw new Error(t.ownerPortal.accountNotFound);
    if (!ACCOUNT_TRANSITIONS[account.status].includes(to)) throw new Error(t.ownerPortal.invalidAccountTransition);

    const data: Record<string, unknown> = { status: to };
    if (to === "SUSPENDED") {
      data.suspendedAt = new Date();
      data.suspendedByUserId = user.id;
    }
    if (to === "DISABLED") {
      data.disabledAt = new Date();
      data.disabledByUserId = user.id;
    }
    if (to === "ACTIVE") {
      data.suspendedAt = null;
      data.suspendedByUserId = null;
    }

    await tx.ownerPortalAccount.update({ where: { id: accountId }, data });
    await auditAction(tx, {
      action: to === "ACTIVE" ? "ACTIVATE" : "DEACTIVATE",
      entityType: "OwnerPortalAccount",
      entityId: accountId,
      entityDisplayName: account.email,
      previousValues: { status: account.status },
      newValues: { status: to, ...extra },
    });
    return account.ownerId;
  });

  revalidatePath(`/owners/${ownerId}`);
}

const accountIdSchema = z.object({ accountId: z.string().min(1) });

/** FormData-based (hidden `accountId` input), matching this codebase's convention for direct `<form action={...}>` bindings elsewhere (e.g. activateTenantPortalAccount). */
export async function activateOwnerPortalAccount(formData: FormData) {
  const { accountId } = accountIdSchema.parse({ accountId: formData.get("accountId") });
  await transitionAccount(accountId, "ownerPortalAccount.activate", "ACTIVE");
}

export async function suspendOwnerPortalAccount(formData: FormData) {
  const { accountId } = accountIdSchema.parse({ accountId: formData.get("accountId") });
  await transitionAccount(accountId, "ownerPortalAccount.suspend", "SUSPENDED");
}

export async function disableOwnerPortalAccount(formData: FormData) {
  const { accountId } = accountIdSchema.parse({ accountId: formData.get("accountId") });
  await transitionAccount(accountId, "ownerPortalAccount.disable", "DISABLED");
}

export interface ResetPasswordResult {
  error?: string;
  temporaryPassword?: string;
}

/** Never displays or returns the OLD credential, only issues a brand-new one; the account must change it again on next login. */
export async function resetOwnerPortalAccountPassword(formData: FormData): Promise<ResetPasswordResult> {
  const { accountId } = accountIdSchema.parse({ accountId: formData.get("accountId") });
  const { organizationId } = await requirePermission("ownerPortalAccount.resetPassword");
  const t = getDictionary(await getLocale());

  const account = await prisma.ownerPortalAccount.findFirst({ where: { id: accountId, organizationId } });
  // Returned, not thrown - see the comment in deleteUnit() (units.ts).
  if (!account) return { error: t.ownerPortal.accountNotFound };

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  await prisma.$transaction(async (tx) => {
    await tx.ownerPortalAccount.update({ where: { id: accountId }, data: { passwordHash, mustChangePassword: true } });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "OwnerPortalAccount",
      entityId: accountId,
      entityDisplayName: account.email,
      previousValues: {},
      newValues: { passwordReset: true },
    });
  });

  revalidatePath(`/owners/${account.ownerId}`);
  return { temporaryPassword };
}
