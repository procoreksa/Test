"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";
import { auditCreate, auditAction } from "@/lib/audit";

function renterSchema(t: ReturnType<typeof getDictionary>) {
  return z.object({
    fullName: z.string().min(1, t.validation.nameRequired),
    fullNameAr: z.string().optional(),
    idType: z.enum(["NATIONAL_ID", "IQAMA", "COMMERCIAL_REGISTRATION", "PASSPORT", "GCC_ID"]),
    idNumber: z.string().optional(),
    vatNumber: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    address: z.string().optional(),
  });
}

export async function createRenter(formData: FormData) {
  const { organizationId } = await requirePermission("renter.create");
  const t = getDictionary(await getLocale());
  const parsed = renterSchema(t).parse({
    fullName: formData.get("fullName"),
    fullNameAr: formData.get("fullNameAr") || undefined,
    idType: formData.get("idType"),
    idNumber: formData.get("idNumber") || undefined,
    vatNumber: formData.get("vatNumber") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    address: formData.get("address") || undefined,
  });

  await prisma.$transaction(async (tx) => {
    const renter = await tx.renter.create({
      data: { ...parsed, email: parsed.email || undefined, organizationId },
    });
    await auditCreate(tx, { entityType: "Renter", entityId: renter.id, entityDisplayName: renter.fullName, newValues: parsed });
  });
  revalidatePath("/renters");
}

export async function deleteRenter(renterId: string) {
  const { organizationId } = await requirePermission("renter.delete");
  await prisma.$transaction(async (tx) => {
    const renter = await tx.renter.delete({ where: { id: renterId, organizationId } });
    await auditAction(tx, {
      action: "DELETE",
      entityType: "Renter",
      entityId: renter.id,
      entityDisplayName: renter.fullName,
      previousValues: renter,
    });
  });
  revalidatePath("/renters");
}

export async function listRenters() {
  const { organizationId } = await requirePermission("renter.view");
  return prisma.renter.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
}
