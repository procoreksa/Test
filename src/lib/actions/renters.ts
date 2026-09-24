"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
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

export async function deleteRenter(renterId: string): Promise<{ error?: string }> {
  const { organizationId } = await requirePermission("renter.delete");
  const t = getDictionary(await getLocale());
  try {
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
  } catch (error) {
    // Same reasoning as deleteUnit(): a renter with any related contract or
    // other business record is protected by an onDelete: Restrict FK - the
    // single source of truth for "is this referenced" - never duplicated
    // here table-by-table. Translate it into a friendly, safe message.
    //
    // Returned, not thrown - see the comment in deleteUnit() (units.ts):
    // a thrown Server Action error's message is redacted by Next.js in a
    // genuine production build once the action is invoked as a plain async
    // call rather than a <form>'s own native `action`.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return { error: t.validation.renterHasHistory };
    }
    throw error;
  }
  revalidatePath("/renters");
  return {};
}

export async function listRenters() {
  const { organizationId } = await requirePermission("renter.view");
  return prisma.renter.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
}
