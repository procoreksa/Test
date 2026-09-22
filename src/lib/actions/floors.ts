"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditCreate, auditAction } from "@/lib/audit";

const floorSchema = z.object({
  buildingId: z.string().min(1),
  floorNumber: z.coerce.number().int(),
  name: z.string().optional(),
  nameAr: z.string().optional(),
});

export async function createFloor(formData: FormData) {
  const { organizationId } = await requirePermission("unit.create");
  const parsed = floorSchema.parse({
    buildingId: formData.get("buildingId"),
    floorNumber: formData.get("floorNumber"),
    name: formData.get("name") || undefined,
    nameAr: formData.get("nameAr") || undefined,
  });

  await prisma.building.findUniqueOrThrow({ where: { id: parsed.buildingId, organizationId } });
  await prisma.$transaction(async (tx) => {
    const floor = await tx.floor.create({ data: { ...parsed, organizationId } });
    await auditCreate(tx, {
      entityType: "Floor",
      entityId: floor.id,
      entityDisplayName: floor.name ?? String(floor.floorNumber),
      newValues: parsed,
    });
  });
  revalidatePath("/floors");
  revalidatePath("/buildings");
}

export async function deleteFloor(floorId: string) {
  const { organizationId } = await requirePermission("unit.delete");
  await prisma.$transaction(async (tx) => {
    const floor = await tx.floor.delete({ where: { id: floorId, organizationId } });
    await auditAction(tx, {
      action: "DELETE",
      entityType: "Floor",
      entityId: floor.id,
      entityDisplayName: floor.name ?? String(floor.floorNumber),
      previousValues: floor,
    });
  });
  revalidatePath("/floors");
  revalidatePath("/buildings");
}

export async function listFloors() {
  const { organizationId } = await requirePermission("unit.view");
  return prisma.floor.findMany({
    where: { organizationId },
    include: { building: { include: { compound: true } }, _count: { select: { units: true } } },
    orderBy: [{ building: { name: "asc" } }, { floorNumber: "asc" }],
  });
}

/** Nested Compound -> Building -> Floor tree used to drive the cascading location picker. */
export async function getLocationTree() {
  const { organizationId } = await requirePermission("unit.view");
  const compounds = await prisma.compound.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
      arabicName: true,
      buildings: {
        select: {
          id: true,
          name: true,
          nameAr: true,
          floors: {
            select: { id: true, name: true, nameAr: true, floorNumber: true },
            orderBy: { floorNumber: "asc" },
          },
        },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
  return compounds;
}
