"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auditCreate, auditUpdate, auditAction, requirePermissionAudited } from "@/lib/audit";
import { getLocale, getDictionary } from "@/lib/i18n";

/** Lightweight corporate contacts (Step 4/30) - no login account in this phase. Deactivated, never hard-deleted. */

const upsertSchema = z.object({
  contactId: z.string().optional(),
  corporateAccountId: z.string().min(1),
  name: z.string().min(1),
  jobTitle: z.string().optional(),
  department: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  contactType: z.enum(["PRIMARY", "HR", "ADMINISTRATION", "FINANCE", "HOUSING_COORDINATOR", "EMERGENCY", "OTHER"]),
  isPrimary: z.coerce.boolean().optional(),
});

export async function upsertCorporateContact(formData: FormData): Promise<string> {
  const { organizationId } = await requirePermissionAudited("corporateContact.manage", "CorporateContact");
  const t = getDictionary(await getLocale());
  const parsed = upsertSchema.parse({
    contactId: formData.get("contactId") || undefined,
    corporateAccountId: formData.get("corporateAccountId"),
    name: formData.get("name"),
    jobTitle: formData.get("jobTitle") || undefined,
    department: formData.get("department") || undefined,
    email: formData.get("email") || "",
    phone: formData.get("phone") || undefined,
    contactType: formData.get("contactType"),
    isPrimary: formData.get("isPrimary") || undefined,
  });

  const contactId = await prisma.$transaction(async (tx) => {
    const account = await tx.corporateAccount.findFirst({ where: { id: parsed.corporateAccountId, organizationId } });
    if (!account) throw new Error(t.corporateHousing.accountNotFound);

    if (parsed.isPrimary) {
      await tx.corporateContact.updateMany({ where: { organizationId, corporateAccountId: parsed.corporateAccountId, isPrimary: true }, data: { isPrimary: false } });
    }

    const data = {
      name: parsed.name,
      jobTitle: parsed.jobTitle,
      department: parsed.department,
      email: parsed.email || undefined,
      phone: parsed.phone,
      contactType: parsed.contactType,
      isPrimary: parsed.isPrimary ?? false,
    };

    if (parsed.contactId) {
      const before = await tx.corporateContact.findFirst({ where: { id: parsed.contactId, organizationId, corporateAccountId: parsed.corporateAccountId } });
      if (!before) throw new Error(t.corporateHousing.contactNotFound);
      const updated = await tx.corporateContact.update({ where: { id: parsed.contactId }, data });
      await auditUpdate(tx, {
        entityType: "CorporateContact",
        entityId: updated.id,
        entityDisplayName: updated.name,
        before: { name: before.name, contactType: before.contactType, isActive: before.isActive },
        after: { name: updated.name, contactType: updated.contactType, isActive: updated.isActive },
      });
      return updated.id;
    }

    const created = await tx.corporateContact.create({ data: { ...data, organizationId, corporateAccountId: parsed.corporateAccountId } });
    await auditCreate(tx, {
      entityType: "CorporateContact",
      entityId: created.id,
      entityDisplayName: created.name,
      newValues: { corporateAccountId: parsed.corporateAccountId, name: created.name, contactType: created.contactType },
    });
    return created.id;
  });

  revalidatePath(`/corporate-housing/accounts/${parsed.corporateAccountId}`);
  return contactId;
}

const toggleSchema = z.object({ contactId: z.string().min(1), corporateAccountId: z.string().min(1) });

async function setContactActive(formData: FormData, isActive: boolean) {
  const { organizationId } = await requirePermissionAudited("corporateContact.manage", "CorporateContact");
  const t = getDictionary(await getLocale());
  const parsed = toggleSchema.parse({ contactId: formData.get("contactId"), corporateAccountId: formData.get("corporateAccountId") });

  await prisma.$transaction(async (tx) => {
    const before = await tx.corporateContact.findFirst({ where: { id: parsed.contactId, organizationId, corporateAccountId: parsed.corporateAccountId } });
    if (!before) throw new Error(t.corporateHousing.contactNotFound);
    const updated = await tx.corporateContact.update({ where: { id: parsed.contactId }, data: { isActive } });
    await auditAction(tx, {
      action: isActive ? "ACTIVATE" : "DEACTIVATE",
      entityType: "CorporateContact",
      entityId: updated.id,
      entityDisplayName: updated.name,
      previousValues: { isActive: before.isActive },
      newValues: { isActive: updated.isActive },
    });
  });

  revalidatePath(`/corporate-housing/accounts/${parsed.corporateAccountId}`);
}

export async function activateCorporateContact(formData: FormData) {
  await setContactActive(formData, true);
}

export async function deactivateCorporateContact(formData: FormData) {
  await setContactActive(formData, false);
}
