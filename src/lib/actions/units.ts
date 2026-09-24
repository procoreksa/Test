"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";
import { auditCreate, auditAction } from "@/lib/audit";

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

  await prisma.$transaction(async (tx) => {
    const unit = await tx.unit.create({
      data: {
        ...parsed,
        organizationId,
        vatApplicable: parsed.vatApplicable ?? COMMERCIAL_UNIT_TYPES.has(parsed.unitType),
      },
    });
    await auditCreate(tx, { entityType: "Unit", entityId: unit.id, entityDisplayName: unit.unitNumber, newValues: parsed });
  });
  revalidatePath("/properties");
  revalidatePath("/units");
}

export async function deleteUnit(unitId: string): Promise<{ error?: string }> {
  const { organizationId } = await requirePermission("unit.delete");
  const t = getDictionary(await getLocale());
  try {
    await prisma.$transaction(async (tx) => {
      const unit = await tx.unit.delete({ where: { id: unitId, organizationId } });
      await auditAction(tx, {
        action: "DELETE",
        entityType: "Unit",
        entityId: unit.id,
        entityDisplayName: unit.unitNumber,
        previousValues: unit,
      });
    });
  } catch (error) {
    // A unit with any related business record (contracts, reservations,
    // viewings, maintenance, move-in/out, corporate allocations, ...) is
    // protected by an onDelete: Restrict FK at the DB level (the single
    // source of truth for "is this referenced" - never duplicated here
    // table-by-table). Translate that constraint into a friendly, safe
    // message instead of letting a raw Prisma error reach the user.
    //
    // This is RETURNED, not thrown: Next.js redacts the message of any
    // error thrown from a Server Action that is invoked as a plain async
    // call (rather than as a <form>'s own native `action`) once running in
    // a genuine production build - the client only ever sees a generic
    // "Minified React error #441" digest, never this friendly text. Real
    // production build UAT (Prompt 24, real-user Finding 5) caught this;
    // `next dev` never reproduces it. See docs/FINAL-UAT-GO-LIVE.md.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return { error: t.validation.unitHasHistory };
    }
    throw error;
  }
  revalidatePath("/units");
  revalidatePath("/properties");
  return {};
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
