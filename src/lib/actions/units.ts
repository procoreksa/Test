"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";

const COMMERCIAL_UNIT_TYPES = new Set(["OFFICE", "SHOP", "WAREHOUSE"]);

function unitSchema(t: ReturnType<typeof getDictionary>) {
  return z.object({
    floorId: z.string().min(1, t.validation.floorRequired),
    unitNumber: z.string().min(1, t.validation.unitNumberRequired),
    floorLabel: z.string().optional(),
    unitType: z.enum(["APARTMENT", "VILLA", "OFFICE", "SHOP", "WAREHOUSE", "OTHER"]),
    areaSqm: z.coerce.number().optional(),
    bedrooms: z.coerce.number().int().optional(),
    bathrooms: z.coerce.number().int().optional(),
    baseRentAmount: z.coerce.number().positive(t.validation.rentAmountPositive),
    vatApplicable: z.coerce.boolean().optional(),
  });
}

export async function createUnit(formData: FormData) {
  const { organizationId } = await requirePermission("unit.create");
  const t = getDictionary(await getLocale());
  const parsed = unitSchema(t).parse({
    floorId: formData.get("floorId"),
    unitNumber: formData.get("unitNumber"),
    floorLabel: formData.get("floorLabel") || undefined,
    unitType: formData.get("unitType"),
    areaSqm: formData.get("areaSqm") || undefined,
    bedrooms: formData.get("bedrooms") || undefined,
    bathrooms: formData.get("bathrooms") || undefined,
    baseRentAmount: formData.get("baseRentAmount"),
    vatApplicable: formData.get("vatApplicable") === "on",
  });

  await prisma.floor.findUniqueOrThrow({
    where: { id: parsed.floorId, organizationId },
  });

  await prisma.unit.create({
    data: {
      ...parsed,
      organizationId,
      vatApplicable: parsed.vatApplicable ?? COMMERCIAL_UNIT_TYPES.has(parsed.unitType),
    },
  });
  revalidatePath("/properties");
  revalidatePath("/units");
}

export async function deleteUnit(unitId: string) {
  const { organizationId } = await requirePermission("unit.delete");
  await prisma.unit.delete({ where: { id: unitId, organizationId } });
  revalidatePath("/units");
  revalidatePath("/properties");
}

export async function listUnits() {
  const { organizationId } = await requirePermission("unit.view");
  return prisma.unit.findMany({
    where: { organizationId },
    include: {
      floor: { include: { building: { include: { compound: true } } } },
      contracts: { where: { status: "ACTIVE" }, include: { renter: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getUnitById(unitId: string) {
  const { organizationId } = await requirePermission("unit.view");
  return prisma.unit.findUniqueOrThrow({
    where: { id: unitId, organizationId },
    include: { floor: { include: { building: { include: { compound: true } } } } },
  });
}
