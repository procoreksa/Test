"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";

function propertySchema(t: ReturnType<typeof getDictionary>) {
  return z.object({
    name: z.string().min(1, t.validation.nameRequired),
    nameAr: z.string().optional(),
    propertyType: z.enum(["RESIDENTIAL", "COMMERCIAL", "MIXED"]),
    city: z.string().optional(),
    district: z.string().optional(),
    street: z.string().optional(),
  });
}

export async function createProperty(formData: FormData) {
  const { organizationId } = await requirePermission("property.create");
  const t = getDictionary(await getLocale());
  const parsed = propertySchema(t).parse({
    name: formData.get("name"),
    nameAr: formData.get("nameAr") || undefined,
    propertyType: formData.get("propertyType"),
    city: formData.get("city") || undefined,
    district: formData.get("district") || undefined,
    street: formData.get("street") || undefined,
  });

  await prisma.property.create({ data: { ...parsed, organizationId } });
  revalidatePath("/properties");
}

export async function deleteProperty(propertyId: string) {
  const { organizationId } = await requirePermission("property.delete");
  await prisma.property.delete({ where: { id: propertyId, organizationId } });
  revalidatePath("/properties");
}

export async function listProperties() {
  const { organizationId } = await requirePermission("property.view");
  return prisma.property.findMany({
    where: { organizationId },
    include: { units: true },
    orderBy: { createdAt: "desc" },
  });
}
