"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";

// Compound/Building/Floor CRUD reuses the existing property.* permission keys
// (Compound and Building) and unit.* keys (Floor) rather than adding new
// Permission keys - see docs/PROPERTY-HIERARCHY.md for the reasoning. RBAC
// itself (permissions.ts, session.ts) is not modified by this migration.

function compoundSchema(t: ReturnType<typeof getDictionary>) {
  return z.object({
    name: z.string().min(1, t.validation.nameRequired),
    arabicName: z.string().optional(),
    description: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    location: z.string().optional(),
    latitude: z.coerce.number().optional(),
    longitude: z.coerce.number().optional(),
    ownerName: z.string().optional(),
    managerName: z.string().optional(),
    amenities: z.string().optional(),
    status: z.enum(["PLANNING", "UNDER_CONSTRUCTION", "ACTIVE", "INACTIVE"]),
  });
}

export async function createCompound(formData: FormData) {
  const { organizationId } = await requirePermission("property.create");
  const t = getDictionary(await getLocale());
  const parsed = compoundSchema(t).parse({
    name: formData.get("name"),
    arabicName: formData.get("arabicName") || undefined,
    description: formData.get("description") || undefined,
    address: formData.get("address") || undefined,
    city: formData.get("city") || undefined,
    location: formData.get("location") || undefined,
    latitude: formData.get("latitude") || undefined,
    longitude: formData.get("longitude") || undefined,
    ownerName: formData.get("ownerName") || undefined,
    managerName: formData.get("managerName") || undefined,
    amenities: formData.get("amenities") || undefined,
    status: formData.get("status") || "ACTIVE",
  });

  await prisma.compound.create({ data: { ...parsed, organizationId } });
  revalidatePath("/compounds");
}

export async function deleteCompound(compoundId: string) {
  const { organizationId } = await requirePermission("property.delete");
  await prisma.compound.delete({ where: { id: compoundId, organizationId } });
  revalidatePath("/compounds");
}

/** Compounds with live-computed building/floor/unit counts (the stored totalBuildings/totalUnits columns are informational only - see docs/PROPERTY-HIERARCHY.md). */
export async function listCompounds() {
  const { organizationId } = await requirePermission("property.view");
  const [compounds, units] = await Promise.all([
    prisma.compound.findMany({
      where: { organizationId },
      include: { buildings: { include: { _count: { select: { floors: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.unit.findMany({
      where: { organizationId },
      select: { floor: { select: { building: { select: { compoundId: true } } } } },
    }),
  ]);

  const unitCountByCompound = new Map<string, number>();
  for (const u of units) {
    const compoundId = u.floor.building.compoundId;
    unitCountByCompound.set(compoundId, (unitCountByCompound.get(compoundId) ?? 0) + 1);
  }

  return compounds.map((c) => ({
    ...c,
    liveTotalBuildings: c.buildings.length,
    liveTotalFloors: c.buildings.reduce((sum, b) => sum + b._count.floors, 0),
    liveTotalUnits: unitCountByCompound.get(c.id) ?? 0,
  }));
}

export async function getCompoundOptions() {
  const { organizationId } = await requirePermission("unit.view");
  return prisma.compound.findMany({
    where: { organizationId },
    select: { id: true, name: true, arabicName: true },
    orderBy: { name: "asc" },
  });
}
