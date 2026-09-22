import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

/** Move-In Schedule Report (Step 41) - every scheduled/in-progress Move-In, soonest first. */
export async function getMoveInScheduleReport() {
  const { organizationId } = await requirePermission("moveIn.view");
  return prisma.moveIn.findMany({
    where: { organizationId, status: { in: ["DRAFT", "SCHEDULED", "IN_PROGRESS", "READY_FOR_HANDOVER"] } },
    include: {
      unit: { include: { floor: { include: { building: { include: { compound: true } } } } } },
      renter: { select: { fullName: true, fullNameAr: true } },
      inspectedByUser: { select: { name: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });
}

/** Move-In Completion Report (Step 41) - every Move-In with its lifecycle timestamps and duration. */
export async function getMoveInCompletionReport() {
  const { organizationId } = await requirePermission("moveIn.view");
  const moveIns = await prisma.moveIn.findMany({
    where: { organizationId },
    include: {
      unit: { select: { unitNumber: true } },
      renter: { select: { fullName: true, fullNameAr: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return moveIns.map((m) => ({
    ...m,
    durationDays: m.completedAt && m.startedAt ? Math.round((m.completedAt.getTime() - m.startedAt.getTime()) / (1000 * 60 * 60 * 24)) : null,
  }));
}

/** Unit Condition Report (Step 41) - inspection items across every Move-In, grouped for a condition-distribution view. */
export async function getUnitConditionReport() {
  const { organizationId } = await requirePermission("moveIn.view");
  return prisma.moveInInspectionItem.findMany({
    where: { organizationId, isApplicable: true, condition: { not: null } },
    include: { moveIn: { select: { moveInNumber: true, unit: { select: { unitNumber: true } } } } },
    orderBy: [{ category: "asc" }, { sequence: "asc" }],
  });
}

/** Handover Defects Report (Step 41) - items flagged for attention or in a poor/damaged/not-working condition. */
export async function getHandoverDefectsReport() {
  const { organizationId } = await requirePermission("moveIn.view");
  return prisma.moveInInspectionItem.findMany({
    where: {
      organizationId,
      isApplicable: true,
      OR: [{ requiresAttention: true }, { condition: { in: ["DAMAGED", "NOT_WORKING", "POOR"] } }],
    },
    include: { moveIn: { select: { moveInNumber: true, status: true, unit: { select: { unitNumber: true } }, renter: { select: { fullName: true, fullNameAr: true } } } } },
    orderBy: { updatedAt: "desc" },
  });
}

/** Meter Reading Report (Step 41). */
export async function getMeterReadingReport() {
  const { organizationId } = await requirePermission("moveIn.view");
  return prisma.moveInMeterReading.findMany({
    where: { organizationId },
    include: { moveIn: { select: { moveInNumber: true, unit: { select: { unitNumber: true } } } } },
    orderBy: { readingDate: "desc" },
  });
}

/** Keys & Access Handover Report (Step 41). */
export async function getKeysHandoverReport() {
  const { organizationId } = await requirePermission("moveIn.view");
  return prisma.moveInKeyItem.findMany({
    where: { organizationId },
    include: { moveIn: { select: { moveInNumber: true, unit: { select: { unitNumber: true } }, renter: { select: { fullName: true, fullNameAr: true } } } } },
    orderBy: { createdAt: "desc" },
  });
}

/** Furnished Inventory Handover Report (Step 41) - furnished Move-Ins only. */
export async function getFurnishedInventoryReport() {
  const { organizationId } = await requirePermission("moveIn.view");
  return prisma.moveInInventoryItem.findMany({
    where: { organizationId, moveIn: { isFurnished: true } },
    include: { moveIn: { select: { moveInNumber: true, unit: { select: { unitNumber: true } }, renter: { select: { fullName: true, fullNameAr: true } } } } },
    orderBy: { createdAt: "desc" },
  });
}
