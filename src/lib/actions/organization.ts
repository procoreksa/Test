"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgId } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";

const MAX_LOGO_BYTES = 1024 * 1024; // 1MB — stored as a base64 data URI directly on the row (no external file storage available).
const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

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
  const t = getDictionary(await getLocale());
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

  const logoFile = formData.get("logo");
  let logoUrl: string | undefined;
  if (logoFile instanceof File && logoFile.size > 0) {
    if (logoFile.size > MAX_LOGO_BYTES) {
      throw new Error(t.validation.logoTooLarge);
    }
    if (!ALLOWED_LOGO_TYPES.includes(logoFile.type)) {
      throw new Error(t.validation.logoInvalidType);
    }
    const buffer = Buffer.from(await logoFile.arrayBuffer());
    logoUrl = `data:${logoFile.type};base64,${buffer.toString("base64")}`;
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: { ...parsed, email: parsed.email || undefined, ...(logoUrl ? { logoUrl } : {}) },
  });
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

export async function getOrganization() {
  const organizationId = await requireOrgId();
  return prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
}
