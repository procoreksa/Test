"use server";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";
import { auditCreate, auditAction } from "@/lib/audit";
import type { UserRole } from "@prisma/client";

/**
 * Internal staff/employee administration (Prompt 24 real-user Finding 2):
 * a production organization has no UI path to add a second employee, change
 * a role, or deactivate an account - the only place `User` rows are ever
 * created is the demo seed script. This mirrors the exact pattern already
 * proven for Tenant/Owner Portal account admin (generated one-time
 * temporary password, org-scoped everywhere, audited).
 */

const STAFF_ROLES: readonly UserRole[] = ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT", "VIEWER"];

function generateTemporaryPassword(): string {
  return randomBytes(9).toString("base64url");
}

export interface CreateStaffUserResult {
  error?: string;
  userId?: string;
  temporaryPassword?: string;
}

export async function listStaffUsers() {
  const { organizationId } = await requirePermission("staffUser.view");
  return prisma.user.findMany({
    where: { organizationId },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(STAFF_ROLES as [UserRole, ...UserRole[]]),
});

export async function createStaffUser(formData: FormData): Promise<CreateStaffUserResult> {
  const { organizationId } = await requirePermission("staffUser.create");
  const t = getDictionary(await getLocale());
  const parsed = createSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  const emailNormalized = parsed.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { organizationId_email: { organizationId, email: emailNormalized } } });
  // Returned, not thrown - see the comment in deleteUnit() (units.ts):
  // a thrown Server Action error's message is redacted by Next.js in a
  // genuine production build once the action is invoked as a plain async
  // call rather than a <form>'s own native `action`.
  if (existing) return { error: t.staffUsers.emailAlreadyInUse };

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  const userId = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { organizationId, name: parsed.name, email: emailNormalized, passwordHash, role: parsed.role, isActive: true },
    });
    await auditCreate(tx, {
      entityType: "User",
      entityId: created.id,
      entityDisplayName: created.email,
      newValues: { name: parsed.name, email: emailNormalized, role: parsed.role },
    });
    return created.id;
  });

  revalidatePath("/settings/users");
  return { userId, temporaryPassword };
}

const roleSchema = z.object({ userId: z.string().min(1), role: z.enum(STAFF_ROLES as [UserRole, ...UserRole[]]) });

export async function updateStaffUserRole(formData: FormData): Promise<void> {
  const { organizationId } = await requirePermission("staffUser.updateRole");
  const parsed = roleSchema.parse({ userId: formData.get("userId"), role: formData.get("role") });

  await prisma.$transaction(async (tx) => {
    const target = await tx.user.findFirstOrThrow({ where: { id: parsed.userId, organizationId } });
    await tx.user.update({ where: { id: target.id }, data: { role: parsed.role } });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "User",
      entityId: target.id,
      entityDisplayName: target.email,
      previousValues: { role: target.role },
      newValues: { role: parsed.role },
    });
  });

  revalidatePath("/settings/users");
}

const activeSchema = z.object({ userId: z.string().min(1), active: z.enum(["true", "false"]) });

export async function setStaffUserActive(formData: FormData): Promise<{ error?: string }> {
  const { organizationId } = await requirePermission(formData.get("active") === "true" ? "staffUser.activate" : "staffUser.deactivate");
  const { user: actor } = await requireSession();
  const t = getDictionary(await getLocale());
  const parsed = activeSchema.parse({ userId: formData.get("userId"), active: formData.get("active") });
  const active = parsed.active === "true";

  // Returned, not thrown - see the comment in deleteUnit() (units.ts): a
  // thrown Server Action error's message is redacted by Next.js in a
  // genuine production build once the action is invoked as a plain async
  // call rather than a <form>'s own native `action`.
  if (!active && parsed.userId === actor.id) {
    return { error: t.staffUsers.cannotDeactivateSelf };
  }

  await prisma.$transaction(async (tx) => {
    const target = await tx.user.findFirstOrThrow({ where: { id: parsed.userId, organizationId } });
    await tx.user.update({ where: { id: target.id }, data: { isActive: active } });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "User",
      entityId: target.id,
      entityDisplayName: target.email,
      previousValues: { isActive: target.isActive },
      newValues: { isActive: active },
    });
  });

  revalidatePath("/settings/users");
  return {};
}

const userIdSchema = z.object({ userId: z.string().min(1) });

export interface ResetStaffPasswordResult {
  temporaryPassword: string;
}

export async function resetStaffUserPassword(formData: FormData): Promise<ResetStaffPasswordResult> {
  const { organizationId } = await requirePermission("staffUser.resetPassword");
  const { userId } = userIdSchema.parse({ userId: formData.get("userId") });

  const target = await prisma.user.findFirstOrThrow({ where: { id: userId, organizationId } });
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await auditAction(tx, {
      action: "UPDATE",
      entityType: "User",
      entityId: userId,
      entityDisplayName: target.email,
      previousValues: {},
      newValues: { passwordReset: true },
    });
  });

  revalidatePath("/settings/users");
  return { temporaryPassword };
}
