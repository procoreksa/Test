"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrgId } from "@/lib/session";

const renterSchema = z.object({
  fullName: z.string().min(1, "الاسم مطلوب"),
  fullNameAr: z.string().optional(),
  idType: z.enum(["NATIONAL_ID", "IQAMA", "COMMERCIAL_REGISTRATION", "PASSPORT", "GCC_ID"]),
  idNumber: z.string().optional(),
  vatNumber: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
});

export async function createRenter(formData: FormData) {
  const organizationId = await requireOrgId();
  const parsed = renterSchema.parse({
    fullName: formData.get("fullName"),
    fullNameAr: formData.get("fullNameAr") || undefined,
    idType: formData.get("idType"),
    idNumber: formData.get("idNumber") || undefined,
    vatNumber: formData.get("vatNumber") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    address: formData.get("address") || undefined,
  });

  await prisma.renter.create({
    data: { ...parsed, email: parsed.email || undefined, organizationId },
  });
  revalidatePath("/renters");
}

export async function deleteRenter(renterId: string) {
  const organizationId = await requireOrgId();
  await prisma.renter.delete({ where: { id: renterId, organizationId } });
  revalidatePath("/renters");
}

export async function listRenters() {
  const organizationId = await requireOrgId();
  return prisma.renter.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
}
