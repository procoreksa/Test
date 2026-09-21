"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";

function buildingSchema(t: ReturnType<typeof getDictionary>) {
  return z.object({
    compoundId: z.string().min(1),
    code: z.string().optional(),
    name: z.string().min(1, t.validation.nameRequired),
    nameAr: z.string().optional(),
    description: z.string().optional(),
    numberOfFloors: z.coerce.number().int().optional(),
  });
}

export async function createBuilding(formData: FormData) {
  const { organizationId } = await requirePermission("property.create");
  const t = getDictionary(await getLocale());
  const parsed = buildingSchema(t).parse({
    compoundId: formData.get("compoundId"),
    code: formData.get("code") || undefined,
    name: formData.get("name"),
    nameAr: formData.get("nameAr") || undefined,
    description: formData.get("description") || undefined,
    numberOfFloors: formData.get("numberOfFloors") || undefined,
  });

  await prisma.compound.findUniqueOrThrow({ where: { id: parsed.compoundId, organizationId } });
  await prisma.building.create({ data: { ...parsed, organizationId } });
  revalidatePath("/buildings");
  revalidatePath("/compounds");
}

export async function deleteBuilding(buildingId: string) {
  const { organizationId } = await requirePermission("property.delete");
  await prisma.building.delete({ where: { id: buildingId, organizationId } });
  revalidatePath("/buildings");
  revalidatePath("/compounds");
}

export async function listBuildings() {
  const { organizationId } = await requirePermission("property.view");
  return prisma.building.findMany({
    where: { organizationId },
    include: { compound: true, _count: { select: { floors: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getBuildingOptions() {
  const { organizationId } = await requirePermission("unit.view");
  return prisma.building.findMany({
    where: { organizationId },
    select: { id: true, name: true, nameAr: true, compoundId: true },
    orderBy: { name: "asc" },
  });
}
