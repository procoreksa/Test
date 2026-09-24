"use server";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";
import { auditCreate, auditAction } from "@/lib/audit";
import type { TenantPortalAccountStatus } from "@prisma/client";

/**
 * Internal (staff-side) administration of Tenant Portal accounts - Step
 * 54/79/81. Every action here is gated by `requirePermission("tenantPortalAccount.*")`,
 * the ordinary internal RBAC gate, since these are actions an internal
 * employee performs on behalf of a tenant - completely distinct from
 * anything a tenant can do to their own account (that boundary lives in
 * src/lib/tenant-session.ts / src/app/portal/**). No public
 * self-registration exists anywhere (Step 56).
 */

const ACCOUNT_TRANSITIONS: Record<TenantPortalAccountStatus, readonly TenantPortalAccountStatus[]> = {
  INVITED: ["ACTIVE"],
  ACTIVE: ["SUSPENDED", "DISABLED"],
  // Reversible - staff may reactivate a suspended account.
  SUSPENDED: ["ACTIVE", "DISABLED"],
  // Terminal in practice (Step 4 of the brief) - no reactivation path from
  // here; a genuinely mistaken disablement is a rare, deliberate future
  // exception, not a routine UI action.
  DISABLED: [],
};

function generateTemporaryPassword(): string {
  // 12 mixed-case/digit characters - readable enough to hand to a tenant
  // over a phone call/in person, strong enough for a one-time credential
  // that mustChangePassword forces replacing on first login.
  return randomBytes(9).toString("base64url");
}

export async function getTenantPortalAccountForRenter(renterId: string) {
  const { organizationId } = await requirePermission("tenantPortalAccount.view");
  return prisma.tenantPortalAccount.findFirst({
    where: { organizationId, renterId },
    select: { id: true, email: true, phone: true, status: true, lastLoginAt: true, mustChangePassword: true, createdAt: true },
  });
}

const createSchema = z.object({
  renterId: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
});

export interface CreateTenantAccountResult {
  error?: string;
  accountId?: string;
  temporaryPassword?: string;
}

/**
 * Step 55: no email-delivery infrastructure exists in this codebase, so
 * this never pretends to send an invitation email. It generates a
 * temporary credential server-side and returns it to the caller exactly
 * once - the calling UI is responsible for displaying it to the admin a
 * single time (see the /renters or Contract edit page integration) and
 * never persists or logs it anywhere. The account starts INVITED, not
 * ACTIVE - login is blocked (src/lib/tenant-auth.ts's authorize() rejects
 * any non-ACTIVE status) until a separate, deliberate activateTenantPortalAccount()
 * call, giving staff a review step between "credential generated" and
 * "tenant can actually sign in".
 */
export async function createTenantPortalAccount(formData: FormData): Promise<CreateTenantAccountResult> {
  const { organizationId } = await requirePermission("tenantPortalAccount.create");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());
  const parsed = createSchema.parse({
    renterId: formData.get("renterId"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
  });

  // Returned, not thrown - see the comment in deleteUnit() (units.ts): a
  // thrown Server Action error's message is redacted by Next.js in a
  // genuine production build once the action is invoked as a plain async
  // call rather than a <form>'s own native `action`.
  const renter = await prisma.renter.findFirst({ where: { id: parsed.renterId, organizationId } });
  if (!renter) return { error: t.tenantPortal.renterNotFound };

  const existing = await prisma.tenantPortalAccount.findUnique({ where: { renterId: parsed.renterId } });
  if (existing) return { error: t.tenantPortal.accountAlreadyExists };

  const emailNormalized = parsed.email.toLowerCase().trim();
  const dup = await prisma.tenantPortalAccount.findUnique({ where: { organizationId_emailNormalized: { organizationId, emailNormalized } } });
  if (dup) return { error: t.tenantPortal.emailAlreadyInUse };

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  const accountId = await prisma.$transaction(async (tx) => {
    const account = await tx.tenantPortalAccount.create({
      data: {
        organizationId,
        renterId: parsed.renterId,
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
      entityType: "TenantPortalAccount",
      entityId: account.id,
      entityDisplayName: account.email,
      newValues: { renterId: parsed.renterId, email: parsed.email, status: "INVITED" },
    });
    return account.id;
  });

  revalidatePath(`/contracts`);
  return { accountId, temporaryPassword };
}

async function transitionAccount(accountId: string, permission: Parameters<typeof requirePermission>[0], to: TenantPortalAccountStatus, extra?: Record<string, unknown>) {
  const { organizationId } = await requirePermission(permission);
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  await prisma.$transaction(async (tx) => {
    const account = await tx.tenantPortalAccount.findFirst({ where: { id: accountId, organizationId } });
    if (!account) throw new Error(t.tenantPortal.accountNotFound);
    if (!ACCOUNT_TRANSITIONS[account.status].includes(to)) throw new Error(t.tenantPortal.invalidAccountTransition);

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

    await tx.tenantPortalAccount.update({ where: { id: accountId }, data });
    await auditAction(tx, {
      action: to === "ACTIVE" ? "ACTIVATE" : "DEACTIVATE",
      entityType: "TenantPortalAccount",
      entityId: accountId,
      entityDisplayName: account.email,
      previousValues: { status: account.status },
      newValues: { status: to, ...extra },
    });
  });

  revalidatePath(`/contracts`);
}

const accountIdSchema = z.object({ accountId: z.string().min(1) });

/** FormData-based (hidden `accountId` input), matching this codebase's convention for direct `<form action={...}>` bindings elsewhere (e.g. cancelTenantMaintenanceRequest). */
export async function activateTenantPortalAccount(formData: FormData) {
  const { accountId } = accountIdSchema.parse({ accountId: formData.get("accountId") });
  await transitionAccount(accountId, "tenantPortalAccount.activate", "ACTIVE");
}

export async function suspendTenantPortalAccount(formData: FormData) {
  const { accountId } = accountIdSchema.parse({ accountId: formData.get("accountId") });
  await transitionAccount(accountId, "tenantPortalAccount.suspend", "SUSPENDED");
}

export async function disableTenantPortalAccount(formData: FormData) {
  const { accountId } = accountIdSchema.parse({ accountId: formData.get("accountId") });
  await transitionAccount(accountId, "tenantPortalAccount.disable", "DISABLED");
}

export interface ResetPasswordResult {
  error?: string;
  temporaryPassword?: string;
}

/** Step 5/55 - never displays or returns the OLD credential, only issues a brand-new one; the account must change it again on next login. */
export async function resetTenantPortalAccountPassword(formData: FormData): Promise<ResetPasswordResult> {
  const { accountId } = accountIdSchema.parse({ accountId: formData.get("accountId") });
  const { organizationId } = await requirePermission("tenantPortalAccount.resetPassword");
  const t = getDictionary(await getLocale());

  const account = await prisma.tenantPortalAccount.findFirst({ where: { id: accountId, organizationId } });
  // Returned, not thrown - see the comment in deleteUnit() (units.ts).
  if (!account) return { error: t.tenantPortal.accountNotFound };

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  await prisma.$transaction(async (tx) => {
    await tx.tenantPortalAccount.update({ where: { id: accountId }, data: { passwordHash, mustChangePassword: true } });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "TenantPortalAccount",
      entityId: accountId,
      entityDisplayName: account.email,
      previousValues: {},
      newValues: { passwordReset: true },
    });
  });

  revalidatePath(`/contracts`);
  return { temporaryPassword };
}
