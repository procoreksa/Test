"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenantSession, requireTenantPrincipal } from "@/lib/tenant-session";
import { getLocale, getDictionary } from "@/lib/i18n";

/**
 * Step 51/52 - deliberately conservative. Renter.fullName/idType/idNumber/
 * vatNumber (company registration)/the account's own login email are all
 * read-only in V1: no verification workflow exists for changing an
 * identity-critical field safely, so none is exposed as editable. The one
 * genuinely safe, authoritative edit is the portal account's own contact
 * phone (TenantPortalAccount.phone) - separate from Renter.phone, which
 * stays the staff-managed official lease contact and is never touched by
 * this action.
 */
export async function getTenantProfile() {
  const { renterId, organizationId } = await requireTenantPrincipal();
  const [renter, account] = await Promise.all([
    prisma.renter.findFirstOrThrow({ where: { id: renterId, organizationId }, select: { fullName: true, fullNameAr: true, idType: true, phone: true, email: true, vatNumber: true } }),
    prisma.tenantPortalAccount.findFirstOrThrow({ where: { renterId, organizationId }, select: { email: true, phone: true, lastLoginAt: true, emailVerifiedAt: true } }),
  ]);
  return { renter, account, isCorporate: !!renter.vatNumber };
}

const phoneSchema = z.object({ phone: z.string().min(1) });

export async function updateTenantContactPhone(formData: FormData) {
  const { tenant } = await requireTenantSession();
  const parsed = phoneSchema.parse({ phone: formData.get("phone") });
  await prisma.tenantPortalAccount.update({ where: { id: tenant.id }, data: { phone: parsed.phone } });
  revalidatePath("/portal/profile");
}

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

/** Step 59 - requires the current password, invalidates nothing beyond the credential itself (the existing session continues, matching src/lib/auth.ts's own posture - there is no forced-logout-of-other-sessions mechanism anywhere in this codebase yet). */
export async function changeTenantPassword(formData: FormData) {
  const { tenant } = await requireTenantSession();
  const t = getDictionary(await getLocale());
  const parsed = passwordChangeSchema.parse({ currentPassword: formData.get("currentPassword"), newPassword: formData.get("newPassword") });

  const account = await prisma.tenantPortalAccount.findUniqueOrThrow({ where: { id: tenant.id } });
  const valid = await bcrypt.compare(parsed.currentPassword, account.passwordHash);
  if (!valid) throw new Error(t.tenantPortal.currentPasswordIncorrect);

  const passwordHash = await bcrypt.hash(parsed.newPassword, 10);
  await prisma.tenantPortalAccount.update({ where: { id: tenant.id }, data: { passwordHash, mustChangePassword: false } });
  revalidatePath("/portal/profile");
}
