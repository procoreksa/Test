"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";
import { activeOwnershipTotalForAsset, getEffectiveOwners, type AssetLevel } from "@/lib/ownership";
import { auditCreate, auditAction, requirePermissionAudited } from "@/lib/audit";

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
  const { organizationId } = await requirePermissionAudited(
    "ownership.manage",
    "PropertyOwnership",
    String(formData.get("assetId") ?? "")
  );
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

  const owner = await prisma.owner.findUniqueOrThrow({ where: { id: parsed.ownerId, organizationId } });
  const assetField = await assertAssetInOrg(organizationId, parsed.assetLevel, parsed.assetId);

  // Hardening (docs/SECURITY-REVIEW.md, "Ownership concurrency"): the
  // read-total-then-insert check below is a classic TOCTOU race under the
  // default READ COMMITTED isolation - two concurrent requests can each
  // read the same pre-insert total, both pass the <=100% check, and both
  // commit, pushing the real total over 100%. Serializable isolation (this
  // codebase's established concurrency-safety strategy for every
  // check-conflicts-then-write critical section - see reservations.ts/
  // reservation-contract.ts/move-ins.ts) makes Postgres detect this
  // read-write conflict and abort one of the two transactions instead.
  await prisma.$transaction(
    async (tx) => {
      const existingTotal = await activeOwnershipTotalForAsset(tx, organizationId, parsed.assetLevel, parsed.assetId);
      const newTotal = existingTotal.plus(parsed.ownershipPercentage);
      if (newTotal.greaterThan(100)) {
        throw new Error(t.validation.ownershipExceeds100(newTotal.toFixed(2)));
      }

      const ownership = await tx.propertyOwnership.create({
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

      await auditCreate(tx, {
        action: "OWNERSHIP_ASSIGNED",
        entityType: "PropertyOwnership",
        entityId: ownership.id,
        entityDisplayName: `${owner.name} - ${parsed.assetLevel} ${parsed.assetId}`,
        newValues: {
          ownerId: parsed.ownerId,
          ...assetField,
          ownershipPercentage: parsed.ownershipPercentage,
          effectiveFrom: parsed.effectiveFrom,
        },
      });
    },
    { isolationLevel: "Serializable" }
  );

  revalidatePath("/owners");
  revalidatePath(`/owners/${parsed.ownerId}`);
  revalidateAssetPaths(parsed.assetLevel, parsed.assetId);
}

export async function endOwnership(ownershipId: string) {
  const { organizationId } = await requirePermissionAudited("ownership.manage", "PropertyOwnership", ownershipId);
  const { user } = await requireSession();

  const ownership = await prisma.$transaction(async (tx) => {
    const before = await tx.propertyOwnership.findUniqueOrThrow({ where: { id: ownershipId, organizationId } });
    const updated = await tx.propertyOwnership.update({
      where: { id: ownershipId, organizationId },
      data: { status: "ENDED", effectiveTo: new Date(), updatedBy: user.id },
    });
    await auditAction(tx, {
      action: "OWNERSHIP_ENDED",
      entityType: "PropertyOwnership",
      entityId: updated.id,
      previousValues: { status: before.status, effectiveTo: before.effectiveTo },
      newValues: { status: updated.status, effectiveTo: updated.effectiveTo },
    });
    return updated;
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
