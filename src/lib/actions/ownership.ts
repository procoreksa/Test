"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";
import { activeOwnershipTotalForAsset, getEffectiveOwners, type AssetLevel } from "@/lib/ownership";

function ownershipSchema(t: ReturnType<typeof getDictionary>) {
  return z.object({
    ownerId: z.string().min(1),
    assetLevel: z.enum(["COMPOUND", "BUILDING", "UNIT"]),
    assetId: z.string().min(1, t.validation.ownershipAssetRequired),
    ownershipPercentage: z.coerce.number().gt(0).lte(100),
    effectiveFrom: z.coerce.date(),
    notes: z.string().optional(),
  });
}

/** Verifies the asset id belongs to this organization, returning the field to set on PropertyOwnership. */
async function assertAssetInOrg(organizationId: string, level: AssetLevel, assetId: string) {
  if (level === "COMPOUND") {
    await prisma.compound.findUniqueOrThrow({ where: { id: assetId, organizationId } });
    return { compoundId: assetId };
  }
  if (level === "BUILDING") {
    await prisma.building.findUniqueOrThrow({ where: { id: assetId, organizationId } });
    return { buildingId: assetId };
  }
  await prisma.unit.findUniqueOrThrow({ where: { id: assetId, organizationId } });
  return { unitId: assetId };
}

export async function createOwnership(formData: FormData) {
  const { organizationId } = await requirePermission("ownership.manage");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());
  const parsed = ownershipSchema(t).parse({
    ownerId: formData.get("ownerId"),
    assetLevel: formData.get("assetLevel"),
    assetId: formData.get("assetId"),
    ownershipPercentage: formData.get("ownershipPercentage"),
    effectiveFrom: formData.get("effectiveFrom") || new Date(),
    notes: formData.get("notes") || undefined,
  });

  await prisma.owner.findUniqueOrThrow({ where: { id: parsed.ownerId, organizationId } });
  const assetField = await assertAssetInOrg(organizationId, parsed.assetLevel, parsed.assetId);

  const existingTotal = await activeOwnershipTotalForAsset(prisma, organizationId, parsed.assetLevel, parsed.assetId);
  const newTotal = existingTotal.plus(parsed.ownershipPercentage);
  if (newTotal.greaterThan(100)) {
    throw new Error(t.validation.ownershipExceeds100(newTotal.toFixed(2)));
  }

  await prisma.propertyOwnership.create({
    data: {
      organizationId,
      ownerId: parsed.ownerId,
      ...assetField,
      ownershipPercentage: parsed.ownershipPercentage,
      effectiveFrom: parsed.effectiveFrom,
      notes: parsed.notes,
      createdBy: user.id,
    },
  });

  revalidatePath("/owners");
  revalidatePath(`/owners/${parsed.ownerId}`);
  revalidateAssetPaths(parsed.assetLevel, parsed.assetId);
}

export async function endOwnership(ownershipId: string) {
  const { organizationId } = await requirePermission("ownership.manage");
  const { user } = await requireSession();

  const ownership = await prisma.propertyOwnership.update({
    where: { id: ownershipId, organizationId },
    data: { status: "ENDED", effectiveTo: new Date(), updatedBy: user.id },
  });

  revalidatePath("/owners");
  revalidatePath(`/owners/${ownership.ownerId}`);
  if (ownership.compoundId) revalidateAssetPaths("COMPOUND", ownership.compoundId);
  if (ownership.buildingId) revalidateAssetPaths("BUILDING", ownership.buildingId);
  if (ownership.unitId) revalidateAssetPaths("UNIT", ownership.unitId);
}

function revalidateAssetPaths(level: AssetLevel, assetId: string) {
  if (level === "COMPOUND") revalidatePath(`/compounds/${assetId}/ownership`);
  if (level === "BUILDING") revalidatePath(`/buildings/${assetId}/ownership`);
  if (level === "UNIT") revalidatePath(`/units/${assetId}/ownership`);
}

/** Full ownership history (active and ended) for one specific asset, newest first. */
export async function listOwnershipForAsset(level: AssetLevel, assetId: string) {
  const { organizationId } = await requirePermission("ownership.view");
  const where =
    level === "COMPOUND" ? { compoundId: assetId } : level === "BUILDING" ? { buildingId: assetId } : { unitId: assetId };

  return prisma.propertyOwnership.findMany({
    where: { organizationId, ...where },
    include: { owner: { select: { id: true, name: true, nameAr: true, ownerType: true } } },
    orderBy: [{ status: "asc" }, { effectiveFrom: "desc" }],
  });
}

export interface EffectiveOwnerDisplay {
  ownerId: string;
  ownerName: string;
  ownerNameAr: string | null;
  ownershipPercentage: Prisma.Decimal;
  sourceLevel: AssetLevel;
}

/** Effective owners for display (with owner name attached), following inheritance. */
export async function getEffectiveOwnersForAsset(level: AssetLevel, assetId: string): Promise<EffectiveOwnerDisplay[]> {
  const { organizationId } = await requirePermission("ownership.view");
  const rows = await getEffectiveOwners(prisma, organizationId, level, assetId);
  if (rows.length === 0) return [];

  const owners = await prisma.owner.findMany({
    where: { id: { in: rows.map((r) => r.ownerId) }, organizationId },
    select: { id: true, name: true, nameAr: true },
  });
  const ownerById = new Map(owners.map((o) => [o.id, o]));

  return rows.map((r) => {
    const owner = ownerById.get(r.ownerId);
    return {
      ownerId: r.ownerId,
      ownerName: owner?.name ?? r.ownerId,
      ownerNameAr: owner?.nameAr ?? null,
      ownershipPercentage: r.ownershipPercentage,
      sourceLevel: r.sourceLevel,
    };
  });
}

/** Every asset (with its ownership %) a given owner is directly assigned to - used on the owner profile page. */
export async function listOwnedAssets(ownerId: string) {
  const { organizationId } = await requirePermission("ownership.view");
  return prisma.propertyOwnership.findMany({
    where: { organizationId, ownerId, status: "ACTIVE" },
    include: {
      compound: { select: { id: true, name: true, arabicName: true } },
      building: { select: { id: true, name: true, nameAr: true, compound: { select: { id: true, name: true, arabicName: true } } } },
      unit: {
        select: {
          id: true,
          unitNumber: true,
          floor: { select: { building: { select: { id: true, name: true, nameAr: true, compound: { select: { id: true, name: true, arabicName: true } } } } } },
        },
      },
    },
    orderBy: { effectiveFrom: "desc" },
  });
}
