"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";
import { auditCreate, auditUpdate, auditAction, requirePermissionAudited } from "@/lib/audit";

function ownerSchema(t: ReturnType<typeof getDictionary>) {
  return z.object({
    ownerType: z.enum(["INDIVIDUAL", "COMPANY", "FUND", "GOVERNMENT_ENTITY", "OTHER"]),
    name: z.string().min(1, t.validation.nameRequired),
    nameAr: z.string().optional(),
    nationalId: z.string().optional(),
    iqamaNumber: z.string().optional(),
    passportNumber: z.string().optional(),
    companyRegistrationNumber: z.string().optional(),
    vatNumber: z.string().optional(),
    email: z.string().optional(),
    mobile: z.string().optional(),
    alternateMobile: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    country: z.string().optional(),
    bankName: z.string().optional(),
    bankAccountName: z.string().optional(),
    iban: z.string().optional(),
    notes: z.string().optional(),
  });
}

function readOwnerFields(formData: FormData) {
  return {
    ownerType: formData.get("ownerType") || "INDIVIDUAL",
    name: formData.get("name"),
    nameAr: formData.get("nameAr") || undefined,
    nationalId: formData.get("nationalId") || undefined,
    iqamaNumber: formData.get("iqamaNumber") || undefined,
    passportNumber: formData.get("passportNumber") || undefined,
    companyRegistrationNumber: formData.get("companyRegistrationNumber") || undefined,
    vatNumber: formData.get("vatNumber") || undefined,
    email: formData.get("email") || undefined,
    mobile: formData.get("mobile") || undefined,
    alternateMobile: formData.get("alternateMobile") || undefined,
    address: formData.get("address") || undefined,
    city: formData.get("city") || undefined,
    country: formData.get("country") || undefined,
    bankName: formData.get("bankName") || undefined,
    bankAccountName: formData.get("bankAccountName") || undefined,
    iban: formData.get("iban") || undefined,
    notes: formData.get("notes") || undefined,
  };
}

export async function createOwner(formData: FormData) {
  const { organizationId } = await requirePermission("owner.create");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());
  const parsed = ownerSchema(t).parse(readOwnerFields(formData));

  await prisma.$transaction(async (tx) => {
    const owner = await tx.owner.create({
      data: { ...parsed, organizationId, createdBy: user.id },
    });
    await auditCreate(tx, { entityType: "Owner", entityId: owner.id, entityDisplayName: owner.name, newValues: parsed });
  });
  revalidatePath("/owners");
}

export async function updateOwner(formData: FormData) {
  const { organizationId } = await requirePermission("owner.update");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());
  const ownerId = z.string().min(1).parse(formData.get("ownerId"));
  const parsed = ownerSchema(t).parse(readOwnerFields(formData));

  await prisma.$transaction(async (tx) => {
    const existing = await tx.owner.findUniqueOrThrow({ where: { id: ownerId, organizationId } });
    const updated = await tx.owner.update({
      where: { id: ownerId, organizationId },
      data: { ...parsed, updatedBy: user.id },
    });
    await auditUpdate(tx, { entityType: "Owner", entityId: updated.id, entityDisplayName: updated.name, before: existing, after: updated });
  });
  revalidatePath("/owners");
  revalidatePath(`/owners/${ownerId}`);
}

export async function deactivateOwner(ownerId: string) {
  const { organizationId } = await requirePermissionAudited("owner.update", "Owner", ownerId);
  const { user } = await requireSession();
  await prisma.$transaction(async (tx) => {
    const owner = await tx.owner.update({ where: { id: ownerId, organizationId }, data: { status: "INACTIVE", updatedBy: user.id } });
    await auditAction(tx, {
      action: "DEACTIVATE",
      entityType: "Owner",
      entityId: owner.id,
      entityDisplayName: owner.name,
      previousValues: { status: "ACTIVE" },
      newValues: { status: "INACTIVE" },
    });
  });
  revalidatePath("/owners");
  revalidatePath(`/owners/${ownerId}`);
}

export async function reactivateOwner(ownerId: string) {
  const { organizationId } = await requirePermission("owner.update");
  const { user } = await requireSession();
  await prisma.$transaction(async (tx) => {
    const owner = await tx.owner.update({ where: { id: ownerId, organizationId }, data: { status: "ACTIVE", updatedBy: user.id } });
    await auditAction(tx, {
      action: "ACTIVATE",
      entityType: "Owner",
      entityId: owner.id,
      entityDisplayName: owner.name,
      previousValues: { status: "INACTIVE" },
      newValues: { status: "ACTIVE" },
    });
  });
  revalidatePath("/owners");
  revalidatePath(`/owners/${ownerId}`);
}

/**
 * Soft-delete only, and only when the owner has no ownership or ledger
 * history - deleting an owner that has ever been assigned an asset or had a
 * ledger entry posted would silently corrupt those records' meaning, so
 * this refuses instead (the owner should be deactivated, not deleted, once
 * it has any history).
 */
export async function deleteOwner(ownerId: string) {
  const { organizationId } = await requirePermissionAudited("owner.update", "Owner", ownerId);
  const t = getDictionary(await getLocale());

  const [ownershipCount, ledgerCount] = await Promise.all([
    prisma.propertyOwnership.count({ where: { organizationId, ownerId } }),
    prisma.ownerLedgerEntry.count({ where: { organizationId, ownerId } }),
  ]);
  if (ownershipCount > 0 || ledgerCount > 0) {
    throw new Error(t.validation.ownerHasHistory);
  }

  await prisma.$transaction(async (tx) => {
    const owner = await tx.owner.update({ where: { id: ownerId, organizationId }, data: { deletedAt: new Date() } });
    await auditAction(tx, {
      action: "SOFT_DELETE",
      entityType: "Owner",
      entityId: owner.id,
      entityDisplayName: owner.name,
      previousValues: { deletedAt: null },
      newValues: { deletedAt: owner.deletedAt },
    });
  });
  revalidatePath("/owners");
}

export async function listOwners() {
  const { organizationId } = await requirePermission("owner.view");
  return prisma.owner.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOwnerById(ownerId: string) {
  const { organizationId } = await requirePermission("owner.view");
  return prisma.owner.findUniqueOrThrow({ where: { id: ownerId, organizationId } });
}
