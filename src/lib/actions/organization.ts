"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgId } from "@/lib/session";

const orgSchema = z.object({
  name: z.string().min(1),
  nameAr: z.string().optional(),
  commercialRegistration: z.string().optional(),
  vatNumber: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  street: z.string().optional(),
  buildingNumber: z.string().optional(),
  postalCode: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
});

export async function updateOrganization(formData: FormData) {
  const organizationId = await requireOrgId();
  const parsed = orgSchema.parse({
    name: formData.get("name"),
    nameAr: formData.get("nameAr") || undefined,
    commercialRegistration: formData.get("commercialRegistration") || undefined,
    vatNumber: formData.get("vatNumber") || undefined,
    city: formData.get("city") || undefined,
    district: formData.get("district") || undefined,
    street: formData.get("street") || undefined,
    buildingNumber: formData.get("buildingNumber") || undefined,
    postalCode: formData.get("postalCode") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
  });

  await prisma.organization.update({
    where: { id: organizationId },
    data: { ...parsed, email: parsed.email || undefined },
  });
  revalidatePath("/settings");
}

export async function getOrganization() {
  const organizationId = await requireOrgId();
  return prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
}
