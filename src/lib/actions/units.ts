"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgId } from "@/lib/session";

const unitSchema = z.object({
  propertyId: z.string().min(1),
  unitNumber: z.string().min(1, "رقم الوحدة مطلوب"),
  floor: z.string().optional(),
  unitType: z.enum(["APARTMENT", "VILLA", "OFFICE", "SHOP", "WAREHOUSE", "OTHER"]),
  areaSqm: z.coerce.number().optional(),
  bedrooms: z.coerce.number().int().optional(),
  bathrooms: z.coerce.number().int().optional(),
  baseRentAmount: z.coerce.number().positive("قيمة الإيجار يجب أن تكون أكبر من صفر"),
  vatApplicable: z.coerce.boolean().optional(),
});

export async function createUnit(formData: FormData) {
  const organizationId = await requireOrgId();
  const parsed = unitSchema.parse({
    propertyId: formData.get("propertyId"),
    unitNumber: formData.get("unitNumber"),
    floor: formData.get("floor") || undefined,
    unitType: formData.get("unitType"),
    areaSqm: formData.get("areaSqm") || undefined,
    bedrooms: formData.get("bedrooms") || undefined,
    bathrooms: formData.get("bathrooms") || undefined,
    baseRentAmount: formData.get("baseRentAmount"),
    vatApplicable: formData.get("vatApplicable") === "on",
  });

  const property = await prisma.property.findUniqueOrThrow({
    where: { id: parsed.propertyId, organizationId },
  });

  await prisma.unit.create({
    data: {
      ...parsed,
      organizationId,
      vatApplicable: parsed.vatApplicable ?? property.propertyType === "COMMERCIAL",
    },
  });
  revalidatePath("/properties");
  revalidatePath("/units");
}

export async function deleteUnit(unitId: string) {
  const organizationId = await requireOrgId();
  await prisma.unit.delete({ where: { id: unitId, organizationId } });
  revalidatePath("/units");
  revalidatePath("/properties");
}

export async function listUnits() {
  const organizationId = await requireOrgId();
  return prisma.unit.findMany({
    where: { organizationId },
    include: { property: true, contracts: { where: { status: "ACTIVE" }, include: { renter: true } } },
    orderBy: { createdAt: "desc" },
  });
}
