import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { diffInventoryItems, reconcileKeyReturns, computeConditionComparisonLabel } from "@/lib/operations/move-out-rules";

/** Applicable-item findings - the same definition used by computeDefectSummary()/the dashboard's own "with findings" count, never a separate formula. */
const FINDING_CONDITIONS = ["DAMAGED", "NOT_WORKING", "POOR"] as const;

/** Move-Out Schedule Report - every scheduled/in-progress Move-Out, soonest first. Mirrors getMoveInScheduleReport() exactly. */
export async function getMoveOutScheduleReport() {
  const { organizationId } = await requirePermission("moveOut.view");
  return prisma.moveOut.findMany({
    where: { organizationId, status: { in: ["DRAFT", "SCHEDULED", "IN_PROGRESS", "PENDING_FINDINGS_REVIEW", "READY_FOR_CLOSURE"] } },
    include: {
      contract: { select: { contractNumber: true } },
      unit: { include: { floor: { include: { building: { include: { compound: true } } } } } },
      renter: { select: { fullName: true, fullNameAr: true } },
      inspectedByUser: { select: { name: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });
}

/** Move-Out Completion Report - every Move-Out with its lifecycle timestamps and duration. Mirrors getMoveInCompletionReport() exactly. */
export async function getMoveOutCompletionReport() {
  const { organizationId } = await requirePermission("moveOut.view");
  const moveOuts = await prisma.moveOut.findMany({
    where: { organizationId },
    include: {
      unit: { select: { unitNumber: true } },
      renter: { select: { fullName: true, fullNameAr: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return moveOuts.map((m) => ({
    ...m,
    durationDays: m.completedAt && m.startedAt ? Math.round((m.completedAt.getTime() - m.startedAt.getTime()) / (1000 * 60 * 60 * 24)) : null,
  }));
}

/** Unit Condition Report - Move-In vs Move-Out condition for every applicable inspection item across every Move-Out. Operational comparison only - never assigns liability. */
export async function getMoveOutUnitConditionReport() {
  const { organizationId } = await requirePermission("moveOut.view");
  const items = await prisma.moveOutInspectionItem.findMany({
    where: { organizationId, isApplicable: true },
    include: {
      moveOut: { select: { moveOutNumber: true, unit: { select: { unitNumber: true } } } },
      moveInInspectionItem: { select: { condition: true } },
    },
    orderBy: [{ category: "asc" }, { sequence: "asc" }],
  });
  return items.map((item) => ({
    ...item,
    comparison: computeConditionComparisonLabel(item.moveInInspectionItem?.condition ?? null, item.condition),
  }));
}

/** Move-Out Findings Report (not "Tenant Damage Charges" - see docs/MOVE-OUT-MANAGEMENT.md, "Finding does not equal liability"). Items flagged for attention or in a poor/damaged/not-working condition, with any linked Maintenance Request. */
export async function getMoveOutFindingsReport() {
  const { organizationId } = await requirePermission("moveOut.view");
  const items = await prisma.moveOutInspectionItem.findMany({
    where: {
      organizationId,
      isApplicable: true,
      OR: [{ requiresAttention: true }, { condition: { in: [...FINDING_CONDITIONS] } }],
    },
    include: {
      moveOut: { select: { moveOutNumber: true, unit: { select: { unitNumber: true } }, renter: { select: { fullName: true, fullNameAr: true } } } },
      moveInInspectionItem: { select: { condition: true } },
      maintenanceRequests: { select: { id: true, requestNumber: true, status: true, priority: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return items.map((item) => ({
    ...item,
    comparison: computeConditionComparisonLabel(item.moveInInspectionItem?.condition ?? null, item.condition),
  }));
}

export interface InventoryVarianceRow {
  moveOutId: string;
  moveOutNumber: string;
  unitNumber: string;
  renterName: string;
  renterNameAr: string | null;
  category: string;
  itemName: string;
  moveInQuantity: number | null;
  moveOutQuantity: number | null;
  moveInCondition: string | null;
  moveOutCondition: string | null;
  status: string;
}

/** Inventory Variance Report (furnished units only, following Move-In's own furnished flag) - per-Move-Out inventory diff against its Move-In baseline. No charge amount - quantities/condition only. */
export async function getInventoryVarianceReport(): Promise<InventoryVarianceRow[]> {
  const { organizationId } = await requirePermission("moveOut.view");
  const moveOuts = await prisma.moveOut.findMany({
    where: { organizationId, OR: [{ moveIn: { isFurnished: true } }, { inventoryItems: { some: {} } }] },
    select: {
      id: true,
      moveOutNumber: true,
      unit: { select: { unitNumber: true } },
      renter: { select: { fullName: true, fullNameAr: true } },
      inventoryItems: { select: { category: true, itemName: true, quantity: true, condition: true } },
      moveIn: { select: { inventoryItems: { select: { category: true, itemName: true, quantity: true, condition: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows: InventoryVarianceRow[] = [];
  for (const m of moveOuts) {
    const diff = diffInventoryItems(m.moveIn?.inventoryItems ?? [], m.inventoryItems);
    for (const line of diff) {
      rows.push({
        moveOutId: m.id,
        moveOutNumber: m.moveOutNumber,
        unitNumber: m.unit.unitNumber,
        renterName: m.renter.fullName,
        renterNameAr: m.renter.fullNameAr,
        category: line.category,
        itemName: line.itemName,
        moveInQuantity: line.moveInQuantity,
        moveOutQuantity: line.moveOutQuantity,
        moveInCondition: line.moveInCondition,
        moveOutCondition: line.moveOutCondition,
        status: line.status,
      });
    }
  }
  return rows;
}

/** Meter Reading Report - every Move-Out meter reading alongside its Move-In baseline and the computed difference. Informational only - no utility billing. */
export async function getMoveOutMeterReadingReport() {
  const { organizationId } = await requirePermission("moveOut.view");
  const readings = await prisma.moveOutMeterReading.findMany({
    where: { organizationId },
    include: {
      moveOut: {
        select: {
          moveOutNumber: true,
          unit: { select: { unitNumber: true } },
          moveIn: { select: { meterReadings: { select: { meterType: true, reading: true } } } },
        },
      },
    },
    orderBy: { readingDate: "desc" },
  });
  return readings.map((r) => {
    const moveInReading = r.moveOut.moveIn?.meterReadings.find((mr) => mr.meterType === r.meterType)?.reading ?? null;
    const moveOutReading = Number(r.reading);
    const moveInReadingNum = moveInReading !== null ? Number(moveInReading) : null;
    return {
      ...r,
      moveInReading: moveInReadingNum,
      difference: moveInReadingNum !== null ? moveOutReading - moveInReadingNum : null,
    };
  });
}

export interface KeyAccessVarianceRow {
  moveOutId: string;
  moveOutNumber: string;
  unitNumber: string;
  renterName: string;
  renterNameAr: string | null;
  keyType: string;
  description: string;
  identifier: string | null;
  issuedQuantity: number;
  returnedQuantity: number;
  difference: number;
  fullyReturned: boolean;
}

/** Keys & Access Report - per-Move-Out reconciliation of what was issued at Move-In (returnedExpected) against what came back at Move-Out, using the same centralized reconcileKeyReturns() the completion gate itself uses. No missing-key charge. */
export async function getMoveOutKeysReport(): Promise<KeyAccessVarianceRow[]> {
  const { organizationId } = await requirePermission("moveOut.view");
  const moveOuts = await prisma.moveOut.findMany({
    where: { organizationId, OR: [{ moveIn: { keyItems: { some: { returnedExpected: true } } } }, { keyItems: { some: {} } }] },
    select: {
      id: true,
      moveOutNumber: true,
      unit: { select: { unitNumber: true } },
      renter: { select: { fullName: true, fullNameAr: true } },
      keyItems: { select: { keyType: true, description: true, quantity: true, identifier: true } },
      moveIn: { select: { keyItems: { select: { keyType: true, description: true, quantity: true, returnedExpected: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows: KeyAccessVarianceRow[] = [];
  for (const m of moveOuts) {
    const expected = (m.moveIn?.keyItems ?? []).filter((k) => k.returnedExpected).map((k) => ({ keyType: k.keyType, description: k.description, quantity: k.quantity }));
    const returned = m.keyItems.map((k) => ({ keyType: k.keyType, description: k.description, quantity: k.quantity }));
    const reconciliation = reconcileKeyReturns(expected, returned);
    for (const line of reconciliation.lines) {
      rows.push({
        moveOutId: m.id,
        moveOutNumber: m.moveOutNumber,
        unitNumber: m.unit.unitNumber,
        renterName: m.renter.fullName,
        renterNameAr: m.renter.fullNameAr,
        keyType: line.keyType,
        description: line.description,
        identifier: m.keyItems.find((k) => k.keyType === line.keyType && k.description === line.description)?.identifier ?? null,
        issuedQuantity: line.expectedQuantity,
        returnedQuantity: line.returnedQuantity,
        difference: line.returnedQuantity - line.expectedQuantity,
        fullyReturned: line.fullyReturned,
      });
    }
    // Keys returned at Move-Out with no Move-In expectation at all (e.g. no
    // baseline Move-In) - still worth showing, informational only.
    if (!reconciliation.hasExpectations) {
      for (const k of m.keyItems) {
        rows.push({
          moveOutId: m.id,
          moveOutNumber: m.moveOutNumber,
          unitNumber: m.unit.unitNumber,
          renterName: m.renter.fullName,
          renterNameAr: m.renter.fullNameAr,
          keyType: k.keyType,
          description: k.description,
          identifier: k.identifier,
          issuedQuantity: 0,
          returnedQuantity: k.quantity,
          difference: k.quantity,
          fullyReturned: true,
        });
      }
    }
  }
  return rows;
}

/** Maintenance Findings Report - inspection findings that already have a Maintenance Request raised from them. Useful for turnover preparation. */
export async function getMoveOutMaintenanceFindingsReport() {
  const { organizationId } = await requirePermission("moveOut.view");
  return prisma.moveOutInspectionItem.findMany({
    where: { organizationId, maintenanceRequests: { some: {} } },
    include: {
      moveOut: { select: { moveOutNumber: true, unit: { select: { unitNumber: true } } } },
      maintenanceRequests: { select: { id: true, requestNumber: true, status: true, priority: true, category: true, createdAt: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}
