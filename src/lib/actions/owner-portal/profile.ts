"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOwnerSession, requireOwnerPrincipal } from "@/lib/owner-session";
import { getLocale, getDictionary } from "@/lib/i18n";

/**
 * Deliberately conservative, mirroring src/lib/actions/portal/profile.ts's
 * own Tenant Portal precedent: Owner.name/nationalId/companyRegistrationNumber/
 * the account's own login email are all read-only in V1 - no verification
 * workflow exists for changing an identity-critical field safely. The one
 * genuinely safe, authoritative edit is the portal account's own contact
 * phone (OwnerPortalAccount.phone) - separate from Owner.mobile, which
 * stays the staff-managed official record and is never touched here.
 */
export async function getOwnerPortalProfile() {
  const { ownerId, organizationId, ownerAccountId } = await requireOwnerPrincipal();
  const [owner, account] = await Promise.all([
    prisma.owner.findFirstOrThrow({ where: { id: ownerId, organizationId }, select: { name: true, nameAr: true, email: true, mobile: true } }),
    prisma.ownerPortalAccount.findUniqueOrThrow({ where: { id: ownerAccountId }, select: { email: true, phone: true, lastLoginAt: true, emailVerifiedAt: true } }),
  ]);
  return { owner, account };
}

const phoneSchema = z.object({ phone: z.string().min(1) });

export async function updateOwnerPortalContactPhone(formData: FormData) {
  const { owner } = await requireOwnerSession();
  const parsed = phoneSchema.parse({ phone: formData.get("phone") });
  await prisma.ownerPortalAccount.update({ where: { id: owner.id }, data: { phone: parsed.phone } });
  revalidatePath("/owner-portal/profile");
}

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

/** Requires the current password; the existing session continues afterward - no forced-logout-of-other-sessions mechanism exists anywhere in this codebase yet, matching both the internal and Tenant Portal posture. */
export async function changeOwnerPortalPassword(formData: FormData) {
  const { owner } = await requireOwnerSession();
  const t = getDictionary(await getLocale());
  const parsed = passwordChangeSchema.parse({ currentPassword: formData.get("currentPassword"), newPassword: formData.get("newPassword") });

  const account = await prisma.ownerPortalAccount.findUniqueOrThrow({ where: { id: owner.id } });
  const valid = await bcrypt.compare(parsed.currentPassword, account.passwordHash);
  if (!valid) throw new Error(t.ownerPortal.currentPasswordIncorrect);

  const passwordHash = await bcrypt.hash(parsed.newPassword, 10);
  await prisma.ownerPortalAccount.update({ where: { id: owner.id }, data: { passwordHash, mustChangePassword: false } });
  revalidatePath("/owner-portal/profile");
}
