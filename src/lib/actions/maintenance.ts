"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import type {
  MaintenanceScopeType,
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceRequestStatus,
  MaintenanceWorkOrderStatus,
  MaintenanceCostResponsibility,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/session";
import { getLocale, getDictionary } from "@/lib/i18n";
import { auditCreate, auditUpdate, auditAction, requirePermissionAudited } from "@/lib/audit";
import { nextCounterValue, formatMaintenanceRequestNumber, formatMaintenanceWorkOrderNumber, formatMaintenanceVendorNumber } from "@/lib/numbering";
import { resolveMaintenanceLocation } from "@/lib/operations/maintenance-location";
import {
  isValidMaintenanceRequestTransition,
  isValidMaintenanceWorkOrderTransition,
  blocksNewWorkOrderForRequest,
  isMaintenanceWorkOrderLocked,
  computeSlaDueDates,
  computeResponseSlaStatus,
  computeResolutionSlaStatus,
  computeOverallSlaStatus,
  isValidWorkOrderSchedule,
  hasScheduleOverlap,
  isScheduleBlockingWorkOrderStatus,
  isMaintenanceRequestOverdue,
  isMaintenanceWorkOrderOverdue,
  computePartTotalCost,
  computeLaborCost,
  computeMaintenanceCostSummary,
  computeCostVariance,
  validateWorkOrderCompletion,
} from "@/lib/operations/maintenance-rules";

const PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// Shared includes
// ---------------------------------------------------------------------------
const REQUEST_LIST_INCLUDE = {
  compound: { select: { id: true, name: true, arabicName: true } },
  building: { select: { id: true, name: true, nameAr: true } },
  unit: { select: { id: true, unitNumber: true } },
  assignedToUser: { select: { id: true, name: true } },
  workOrders: { select: { id: true, workOrderNumber: true, status: true }, orderBy: { createdAt: "desc" as const }, take: 1 },
} satisfies Prisma.MaintenanceRequestInclude;

const REQUEST_FULL_INCLUDE = {
  ...REQUEST_LIST_INCLUDE,
  contract: { select: { id: true, contractNumber: true, status: true } },
  renter: { select: { id: true, fullName: true, fullNameAr: true, phone: true } },
  reportedByUser: { select: { id: true, name: true } },
  triagedByUser: { select: { id: true, name: true } },
  moveIn: { select: { id: true, moveInNumber: true } },
  moveInInspectionItem: { select: { id: true, itemName: true, itemNameAr: true, category: true } },
  moveOut: { select: { id: true, moveOutNumber: true } },
  moveOutInspectionItem: { select: { id: true, itemName: true, itemNameAr: true, category: true } },
  corporateOccupant: {
    select: {
      id: true,
      fullName: true,
      fullNameAr: true,
      employeeNumber: true,
      corporateAccount: { select: { id: true, accountNumber: true, displayName: true } },
    },
  },
  attachments: { orderBy: { createdAt: "asc" as const } },
  workOrders: { orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.MaintenanceRequestInclude;

const WORK_ORDER_LIST_INCLUDE = {
  request: { select: { id: true, requestNumber: true, title: true, category: true, unit: { select: { unitNumber: true } }, building: { select: { name: true } }, compound: { select: { name: true } } } },
  assignedToUser: { select: { id: true, name: true } },
  vendor: { select: { id: true, name: true, nameAr: true } },
} satisfies Prisma.MaintenanceWorkOrderInclude;

const WORK_ORDER_FULL_INCLUDE = {
  ...WORK_ORDER_LIST_INCLUDE,
  verifiedByUser: { select: { id: true, name: true } },
  workLogs: { orderBy: { createdAt: "asc" as const } },
  laborEntries: { orderBy: { createdAt: "asc" as const } },
  partEntries: { orderBy: { createdAt: "asc" as const } },
  costEntries: { orderBy: { createdAt: "asc" as const } },
  attachments: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.MaintenanceWorkOrderInclude;

// ---------------------------------------------------------------------------
// Maintenance Request: create / triage / cancel (Step 43/47/59)
// ---------------------------------------------------------------------------

const scopeTypeEnum = z.enum(["UNIT", "BUILDING_COMMON_AREA", "COMPOUND_COMMON_AREA"]);
const categoryEnum = z.enum([
  "PLUMBING",
  "ELECTRICAL",
  "AIR_CONDITIONING",
  "APPLIANCE",
  "CARPENTRY",
  "PAINTING",
  "CIVIL",
  "FLOORING",
  "DOORS_WINDOWS",
  "ELEVATOR",
  "POOL",
  "LANDSCAPING",
  "PEST_CONTROL",
  "CLEANING",
  "FIRE_SAFETY",
  "SECURITY_SYSTEM",
  "INTERNET_TELECOM",
  "GENERAL",
  "OTHER",
]);
const priorityEnum = z.enum(["LOW", "NORMAL", "HIGH", "URGENT", "EMERGENCY"]);
const reportedByTypeEnum = z.enum(["STAFF", "TENANT", "OWNER", "SECURITY", "HOUSEKEEPING", "MANAGEMENT", "OTHER"]);
const sourceEnum = z.enum(["INTERNAL", "TENANT", "MOVE_IN_INSPECTION", "MOVE_OUT_INSPECTION", "MANAGEMENT", "SECURITY", "HOUSEKEEPING", "OTHER"]);
const cancelReasonEnum = z.enum(["DUPLICATE", "NOT_NEEDED", "TENANT_WITHDREW", "RESOLVED_INFORMALLY", "DATA_ERROR", "OTHER"]);

export async function createMaintenanceRequest(formData: FormData): Promise<string> {
  const { organizationId } = await requirePermission("maintenance.request.create");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const parsed = z
    .object({
      scopeType: scopeTypeEnum,
      compoundId: z.string().optional(),
      buildingId: z.string().optional(),
      unitId: z.string().optional(),
      contractId: z.string().optional(),
      renterId: z.string().optional(),
      category: categoryEnum,
      priority: priorityEnum.default("NORMAL"),
      title: z.string().min(1, t.validation.nameRequired),
      description: z.string().optional(),
      reportedByType: reportedByTypeEnum,
      reportedByName: z.string().optional(),
      reportedByPhone: z.string().optional(),
      preferredVisitDate: z.coerce.date().optional(),
      preferredTimeWindow: z.string().optional(),
      permissionToEnter: z.coerce.boolean().optional(),
      source: sourceEnum.default("INTERNAL"),
      moveInId: z.string().optional(),
      moveInInspectionItemId: z.string().optional(),
      moveOutId: z.string().optional(),
      moveOutInspectionItemId: z.string().optional(),
    })
    .parse({
      scopeType: formData.get("scopeType"),
      compoundId: formData.get("compoundId") || undefined,
      buildingId: formData.get("buildingId") || undefined,
      unitId: formData.get("unitId") || undefined,
      contractId: formData.get("contractId") || undefined,
      renterId: formData.get("renterId") || undefined,
      category: formData.get("category"),
      priority: formData.get("priority") || undefined,
      title: formData.get("title"),
      description: formData.get("description") || undefined,
      reportedByType: formData.get("reportedByType"),
      reportedByName: formData.get("reportedByName") || undefined,
      reportedByPhone: formData.get("reportedByPhone") || undefined,
      preferredVisitDate: formData.get("preferredVisitDate") || undefined,
      preferredTimeWindow: formData.get("preferredTimeWindow") || undefined,
      permissionToEnter: formData.get("permissionToEnter") || undefined,
      source: formData.get("source") || undefined,
      moveInId: formData.get("moveInId") || undefined,
      moveInInspectionItemId: formData.get("moveInInspectionItemId") || undefined,
      moveOutId: formData.get("moveOutId") || undefined,
      moveOutInspectionItemId: formData.get("moveOutInspectionItemId") || undefined,
    });

  const requestId = await prisma.$transaction(
    async (tx) => {
      const location = await resolveMaintenanceLocation(tx, t.validation, {
        organizationId,
        scopeType: parsed.scopeType,
        compoundId: parsed.compoundId,
        buildingId: parsed.buildingId,
        unitId: parsed.unitId,
        contractId: parsed.contractId,
        renterId: parsed.renterId,
      });

      const reportedAt = new Date();
      const { responseDueAt, resolutionDueAt } = computeSlaDueDates(reportedAt, parsed.priority);

      const seq = await nextCounterValue(tx, organizationId, "maintenanceRequest");
      const requestNumber = formatMaintenanceRequestNumber(seq);

      const created = await tx.maintenanceRequest.create({
        data: {
          organizationId,
          requestNumber,
          scopeType: location.scopeType,
          compoundId: location.compoundId,
          buildingId: location.buildingId,
          unitId: location.unitId,
          contractId: location.contractId,
          renterId: location.renterId,
          category: parsed.category,
          priority: parsed.priority,
          status: "OPEN",
          title: parsed.title,
          description: parsed.description,
          reportedByType: parsed.reportedByType,
          reportedByUserId: parsed.reportedByType === "STAFF" ? user.id : null,
          reportedByName: parsed.reportedByName,
          reportedByPhone: parsed.reportedByPhone,
          reportedAt,
          preferredVisitDate: parsed.preferredVisitDate,
          preferredTimeWindow: parsed.preferredTimeWindow,
          permissionToEnter: parsed.permissionToEnter,
          source: parsed.source,
          responseDueAt,
          resolutionDueAt,
          // Step 40: reference only - never mutates the Move-In/inspection item itself.
          moveInId: parsed.moveInId,
          moveInInspectionItemId: parsed.moveInInspectionItemId,
          // Move-Out Management Phase 2, requirement 10: reference only -
          // never mutates the MoveOut/inspection item itself.
          moveOutId: parsed.moveOutId,
          moveOutInspectionItemId: parsed.moveOutInspectionItemId,
          createdByUserId: user.id,
        },
      });

      await auditCreate(tx, {
        entityType: "MaintenanceRequest",
        entityId: created.id,
        entityDisplayName: created.requestNumber,
        newValues: { scopeType: created.scopeType, category: created.category, priority: created.priority, unitId: created.unitId, buildingId: created.buildingId, compoundId: created.compoundId },
      });

      return created.id;
    },
    { isolationLevel: "Serializable" }
  );

  revalidatePath("/operations/maintenance/requests");
  revalidatePath("/operations");
  return requestId;
}

/** Step 39: authorized action from a completed Move-In inspection item. Never mutates the MoveIn/inspection item baseline - reference only. */
export async function createMaintenanceRequestFromMoveIn(formData: FormData): Promise<string> {
  const { organizationId } = await requirePermission("maintenance.request.create");

  const moveInId = z.string().min(1).parse(formData.get("moveInId"));
  const inspectionItemId = z.string().min(1).parse(formData.get("inspectionItemId"));

  const item = await prisma.moveInInspectionItem.findFirst({
    where: { id: inspectionItemId, organizationId, moveInId },
    include: { moveIn: { select: { id: true, unitId: true } } },
  });
  if (!item) throw new Error("Move-In inspection item not found");

  const built = new FormData();
  built.set("scopeType", "UNIT");
  built.set("unitId", item.moveIn.unitId);
  built.set("category", (formData.get("category") as string) || "GENERAL");
  built.set("priority", (formData.get("priority") as string) || "NORMAL");
  built.set("title", (formData.get("title") as string) || item.itemName);
  built.set("description", (formData.get("description") as string) || item.notes || "");
  built.set("reportedByType", "STAFF");
  built.set("source", "MOVE_IN_INSPECTION");
  built.set("moveInId", moveInId);
  built.set("moveInInspectionItemId", inspectionItemId);

  return createMaintenanceRequest(built);
}

/**
 * Move-Out Management Phase 2, requirement 10: authorized action from a
 * Move-Out inspection finding, mirroring createMaintenanceRequestFromMoveIn()
 * field-for-field. Never mutates the MoveOut/inspection item baseline -
 * reference only - and never posts anything financial (Decision 4: damages
 * are operational records only). The source Move-Out and inspection item are
 * re-verified same-organization and mutually consistent here, exactly like
 * the Move-In version above; UNIT scope is derived from the Move-Out's own
 * (Contract-derived) unitId, never trusted from the client.
 */
export async function createMaintenanceRequestFromMoveOut(formData: FormData): Promise<string> {
  const { organizationId } = await requirePermission("maintenance.request.create");

  const moveOutId = z.string().min(1).parse(formData.get("moveOutId"));
  const inspectionItemId = z.string().min(1).parse(formData.get("inspectionItemId"));

  const item = await prisma.moveOutInspectionItem.findFirst({
    where: { id: inspectionItemId, organizationId, moveOutId },
    include: { moveOut: { select: { id: true, unitId: true } } },
  });
  if (!item) throw new Error("Move-Out inspection item not found");

  const built = new FormData();
  built.set("scopeType", "UNIT");
  built.set("unitId", item.moveOut.unitId);
  built.set("category", (formData.get("category") as string) || "GENERAL");
  built.set("priority", (formData.get("priority") as string) || "NORMAL");
  built.set("title", (formData.get("title") as string) || item.itemName);
  built.set("description", (formData.get("description") as string) || item.notes || "");
  built.set("reportedByType", "STAFF");
  built.set("source", "MOVE_OUT_INSPECTION");
  built.set("moveOutId", moveOutId);
  built.set("moveOutInspectionItemId", inspectionItemId);

  return createMaintenanceRequest(built);
}

export async function triageMaintenanceRequest(requestId: string, formData: FormData): Promise<void> {
  const { organizationId } = await requirePermission("maintenance.request.triage");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const parsed = z
    .object({
      category: categoryEnum.optional(),
      priority: priorityEnum.optional(),
      assignedToUserId: z.string().optional(),
      triageNotes: z.string().optional(),
    })
    .parse({
      category: formData.get("category") || undefined,
      priority: formData.get("priority") || undefined,
      assignedToUserId: formData.get("assignedToUserId") || undefined,
      triageNotes: formData.get("triageNotes") || undefined,
    });

  await prisma.$transaction(async (tx) => {
    const request = await tx.maintenanceRequest.findFirstOrThrow({ where: { id: requestId, organizationId } });

    if (!isValidMaintenanceRequestTransition(request.status, "TRIAGED") && request.status !== "TRIAGED") {
      throw new Error(t.validation.maintenanceInvalidTransition);
    }

    if (parsed.assignedToUserId) {
      const assignee = await tx.user.findFirst({ where: { id: parsed.assignedToUserId, organizationId } });
      if (!assignee) throw new Error(t.validation.maintenanceUnitNotFound);
    }

    const now = new Date();
    const before = { category: request.category, priority: request.priority, status: request.status };

    const updated = await tx.maintenanceRequest.update({
      where: { id: request.id },
      data: {
        category: parsed.category ?? request.category,
        priority: parsed.priority ?? request.priority,
        assignedToUserId: parsed.assignedToUserId ?? request.assignedToUserId,
        triageNotes: parsed.triageNotes ?? request.triageNotes,
        status: request.status === "OPEN" ? "TRIAGED" : request.status,
        triagedAt: request.triagedAt ?? now,
        triagedByUserId: request.triagedByUserId ?? user.id,
        // Step 28: set once, never overwritten - first operational response.
        firstResponseAt: request.firstResponseAt ?? now,
      },
    });

    await auditUpdate(tx, {
      entityType: "MaintenanceRequest",
      entityId: request.id,
      entityDisplayName: request.requestNumber,
      before,
      after: { category: updated.category, priority: updated.priority, status: updated.status },
    });
  });

  revalidatePath(`/operations/maintenance/requests/${requestId}`);
  revalidatePath("/operations/maintenance/requests");
}

export async function cancelMaintenanceRequest(requestId: string, formData: FormData): Promise<void> {
  const { organizationId } = await requirePermissionAudited("maintenance.request.cancel", "MaintenanceRequest", requestId);
  const t = getDictionary(await getLocale());

  const parsed = z
    .object({
      cancelReason: cancelReasonEnum,
      cancelReasonNote: z.string().optional(),
    })
    .parse({ cancelReason: formData.get("cancelReason"), cancelReasonNote: formData.get("cancelReasonNote") || undefined });

  if (parsed.cancelReason === "OTHER" && !parsed.cancelReasonNote) {
    throw new Error(t.validation.maintenanceCancelReasonRequired);
  }

  await prisma.$transaction(async (tx) => {
    const request = await tx.maintenanceRequest.findFirstOrThrow({ where: { id: requestId, organizationId } });
    if (!isValidMaintenanceRequestTransition(request.status, "CANCELLED")) {
      throw new Error(t.validation.maintenanceInvalidTransition);
    }

    await tx.maintenanceRequest.update({
      where: { id: request.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: parsed.cancelReason, cancelReasonNote: parsed.cancelReasonNote },
    });

    await auditAction(tx, {
      action: "CANCEL",
      entityType: "MaintenanceRequest",
      entityId: request.id,
      entityDisplayName: request.requestNumber,
      metadata: { cancelReason: parsed.cancelReason },
    });
  });

  revalidatePath(`/operations/maintenance/requests/${requestId}`);
  revalidatePath("/operations/maintenance/requests");
}

// ---------------------------------------------------------------------------
// Maintenance Request: get / list
// ---------------------------------------------------------------------------

function withRequestSla<T extends { reportedAt: Date; responseDueAt: Date | null; resolutionDueAt: Date | null; firstResponseAt: Date | null; resolvedAt: Date | null; status: MaintenanceRequestStatus }>(
  row: T
) {
  const response = computeResponseSlaStatus({ reportedAt: row.reportedAt, responseDueAt: row.responseDueAt, firstResponseAt: row.firstResponseAt });
  const resolution = computeResolutionSlaStatus({
    reportedAt: row.reportedAt,
    resolutionDueAt: row.resolutionDueAt,
    resolvedAt: row.resolvedAt,
    requestStatus: row.status,
  });
  return { ...row, slaResponseStatus: response, slaResolutionStatus: resolution, slaOverallStatus: computeOverallSlaStatus(response, resolution), overdue: isMaintenanceRequestOverdue(row.resolutionDueAt, row.status) };
}

export async function getMaintenanceRequestById(id: string) {
  const { organizationId } = await requirePermission("maintenance.view");
  const request = await prisma.maintenanceRequest.findFirstOrThrow({ where: { id, organizationId }, include: REQUEST_FULL_INCLUDE });
  return withRequestSla(request);
}

export interface MaintenanceRequestListFilters {
  page?: number;
  search?: string;
  status?: string;
  priority?: string;
  category?: string;
  scopeType?: string;
  compoundId?: string;
  buildingId?: string;
  unitId?: string;
  assignedToUserId?: string;
  slaBreachedOnly?: boolean;
  openOnly?: boolean;
  emergencyOnly?: boolean;
}

export async function listMaintenanceRequests(filters: MaintenanceRequestListFilters = {}) {
  const { organizationId } = await requirePermission("maintenance.view");
  const page = Math.max(1, filters.page ?? 1);

  const where: Prisma.MaintenanceRequestWhereInput = {
    organizationId,
    status: (filters.status as MaintenanceRequestStatus) || undefined,
    priority: filters.emergencyOnly ? "EMERGENCY" : (filters.priority as MaintenancePriority) || undefined,
    category: (filters.category as MaintenanceCategory) || undefined,
    scopeType: (filters.scopeType as MaintenanceScopeType) || undefined,
    compoundId: filters.compoundId || undefined,
    buildingId: filters.buildingId || undefined,
    unitId: filters.unitId || undefined,
    assignedToUserId: filters.assignedToUserId || undefined,
    ...(filters.openOnly ? { status: { notIn: ["RESOLVED", "CANCELLED"] } } : {}),
    ...(filters.search
      ? {
          OR: [
            { requestNumber: { contains: filters.search, mode: "insensitive" as const } },
            { title: { contains: filters.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.maintenanceRequest.findMany({ where, include: REQUEST_LIST_INCLUDE, orderBy: { reportedAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.maintenanceRequest.count({ where }),
  ]);

  let withSla = rows.map(withRequestSla);
  if (filters.slaBreachedOnly) {
    withSla = withSla.filter((r) => r.slaOverallStatus === "BREACHED");
  }

  return { rows: withSla, total, page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

// ---------------------------------------------------------------------------
// Work Order: create from Request (Step 48)
// ---------------------------------------------------------------------------

export async function createWorkOrderFromRequest(requestId: string, formData: FormData): Promise<string> {
  const { organizationId } = await requirePermission("maintenance.workOrder.create");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const parsed = z
    .object({
      priority: priorityEnum.optional(),
      estimatedCost: z.coerce.number().nonnegative(t.validation.maintenanceAmountNonNegative).optional(),
    })
    .parse({
      priority: formData.get("priority") || undefined,
      estimatedCost: formData.get("estimatedCost") || undefined,
    });

  const workOrderId = await prisma.$transaction(
    async (tx) => {
      const request = await tx.maintenanceRequest.findFirstOrThrow({ where: { id: requestId, organizationId } });

      if (request.status !== "TRIAGED") {
        throw new Error(t.validation.maintenanceInvalidTransition);
      }

      // Step 17: one active primary Work Order per Request - app-layer
      // predicate inside a Serializable transaction, mirroring
      // blocksNewMoveInForContract()'s own precedent exactly.
      const existingWorkOrders = await tx.maintenanceWorkOrder.findMany({ where: { organizationId, requestId }, select: { status: true } });
      if (existingWorkOrders.some((w) => blocksNewWorkOrderForRequest(w.status))) {
        throw new Error(t.validation.maintenanceWorkOrderAlreadyExists);
      }

      const seq = await nextCounterValue(tx, organizationId, "maintenanceWorkOrder");
      const workOrderNumber = formatMaintenanceWorkOrderNumber(seq);

      const created = await tx.maintenanceWorkOrder.create({
        data: {
          organizationId,
          workOrderNumber,
          requestId: request.id,
          status: "DRAFT",
          priority: parsed.priority ?? request.priority,
          estimatedCost: parsed.estimatedCost,
          createdByUserId: user.id,
        },
      });

      await tx.maintenanceRequest.update({ where: { id: request.id }, data: { status: "WORK_ORDER_CREATED" } });

      await auditCreate(tx, {
        entityType: "MaintenanceWorkOrder",
        entityId: created.id,
        entityDisplayName: created.workOrderNumber,
        newValues: { requestId: request.id, priority: created.priority },
      });

      return created.id;
    },
    { isolationLevel: "Serializable" }
  );

  revalidatePath(`/operations/maintenance/requests/${requestId}`);
  revalidatePath("/operations/maintenance/work-orders");
  return workOrderId;
}

// ---------------------------------------------------------------------------
// Work Order: assignment / scheduling (Step 18-24)
// ---------------------------------------------------------------------------

async function assertNoScheduleOverlap(
  tx: Prisma.TransactionClient,
  organizationId: string,
  assignedToUserId: string,
  scheduledStart: Date,
  scheduledEnd: Date,
  excludeWorkOrderId: string
) {
  const candidates = await tx.maintenanceWorkOrder.findMany({
    where: { organizationId, assignedToUserId, id: { not: excludeWorkOrderId }, scheduledStart: { not: null }, scheduledEnd: { not: null } },
    select: { id: true, status: true, scheduledStart: true, scheduledEnd: true },
  });
  const overlapping = candidates.some(
    (c) => isScheduleBlockingWorkOrderStatus(c.status) && c.scheduledStart && c.scheduledEnd && hasScheduleOverlap(c.scheduledStart, c.scheduledEnd, scheduledStart, scheduledEnd)
  );
  return overlapping;
}

export async function assignWorkOrder(workOrderId: string, formData: FormData): Promise<void> {
  const { organizationId } = await requirePermission("maintenance.workOrder.assign");
  const t = getDictionary(await getLocale());

  const parsed = z
    .object({ assignedToUserId: z.string().optional(), vendorId: z.string().optional() })
    .parse({ assignedToUserId: formData.get("assignedToUserId") || undefined, vendorId: formData.get("vendorId") || undefined });

  // Step 22: one responsible party - internal User OR Vendor, never both.
  if (parsed.assignedToUserId && parsed.vendorId) {
    throw new Error(t.validation.maintenanceOneResponsiblePartyOnly);
  }

  await prisma.$transaction(async (tx) => {
    const workOrder = await tx.maintenanceWorkOrder.findFirstOrThrow({ where: { id: workOrderId, organizationId } });
    if (isMaintenanceWorkOrderLocked(workOrder.status)) throw new Error(t.validation.maintenanceWorkOrderLocked);

    if (parsed.assignedToUserId) {
      const assignee = await tx.user.findFirst({ where: { id: parsed.assignedToUserId, organizationId } });
      if (!assignee) throw new Error(t.validation.maintenanceUnitNotFound);
    }
    if (parsed.vendorId) {
      const vendor = await tx.maintenanceVendor.findFirst({ where: { id: parsed.vendorId, organizationId } });
      if (!vendor) throw new Error(t.validation.maintenanceUnitNotFound);
      if (!vendor.active) throw new Error(t.validation.maintenanceVendorInactive);
    }

    const nextStatus: MaintenanceWorkOrderStatus = workOrder.status === "DRAFT" ? "ASSIGNED" : workOrder.status;
    if (workOrder.status === "DRAFT" && !isValidMaintenanceWorkOrderTransition(workOrder.status, nextStatus)) {
      throw new Error(t.validation.maintenanceInvalidTransition);
    }

    await tx.maintenanceWorkOrder.update({
      where: { id: workOrder.id },
      data: { assignedToUserId: parsed.assignedToUserId ?? null, vendorId: parsed.vendorId ?? null, status: nextStatus },
    });

    await auditAction(tx, {
      action: "UPDATE",
      entityType: "MaintenanceWorkOrder",
      entityId: workOrder.id,
      entityDisplayName: workOrder.workOrderNumber,
      metadata: { assignedToUserId: parsed.assignedToUserId ?? null, vendorId: parsed.vendorId ?? null },
    });
  });

  revalidatePath(`/operations/maintenance/work-orders/${workOrderId}`);
}

export async function scheduleWorkOrder(workOrderId: string, formData: FormData): Promise<void> {
  const { organizationId } = await requirePermission("maintenance.workOrder.update");
  const t = getDictionary(await getLocale());

  const parsed = z
    .object({ scheduledStart: z.coerce.date(), scheduledEnd: z.coerce.date() })
    .parse({ scheduledStart: formData.get("scheduledStart"), scheduledEnd: formData.get("scheduledEnd") });

  if (!isValidWorkOrderSchedule(parsed.scheduledStart, parsed.scheduledEnd)) {
    throw new Error(t.validation.maintenanceScheduleEndAfterStart);
  }

  await prisma.$transaction(async (tx) => {
    const workOrder = await tx.maintenanceWorkOrder.findFirstOrThrow({ where: { id: workOrderId, organizationId } });
    if (isMaintenanceWorkOrderLocked(workOrder.status)) throw new Error(t.validation.maintenanceWorkOrderLocked);

    // Step 24: detect and block exact overlapping assignments for internal staff (V1 rule).
    if (workOrder.assignedToUserId) {
      const overlaps = await assertNoScheduleOverlap(tx, organizationId, workOrder.assignedToUserId, parsed.scheduledStart, parsed.scheduledEnd, workOrder.id);
      if (overlaps) throw new Error(t.validation.maintenanceScheduleOverlap);
    }

    const nextStatus: MaintenanceWorkOrderStatus = workOrder.status === "ASSIGNED" ? "SCHEDULED" : workOrder.status;

    await tx.maintenanceWorkOrder.update({
      where: { id: workOrder.id },
      data: { scheduledStart: parsed.scheduledStart, scheduledEnd: parsed.scheduledEnd, status: nextStatus },
    });

    await auditAction(tx, {
      action: "UPDATE",
      entityType: "MaintenanceWorkOrder",
      entityId: workOrder.id,
      entityDisplayName: workOrder.workOrderNumber,
      metadata: { scheduledStart: parsed.scheduledStart, scheduledEnd: parsed.scheduledEnd },
    });
  });

  revalidatePath(`/operations/maintenance/work-orders/${workOrderId}`);
}

// ---------------------------------------------------------------------------
// Work Order: lifecycle (start/hold/resume/diagnose/complete/verify/close/cancel)
// ---------------------------------------------------------------------------

export async function startWorkOrder(workOrderId: string): Promise<void> {
  const { organizationId } = await requirePermission("maintenance.workOrder.start");
  const t = getDictionary(await getLocale());

  await prisma.$transaction(async (tx) => {
    const workOrder = await tx.maintenanceWorkOrder.findFirstOrThrow({ where: { id: workOrderId, organizationId } });
    if (!isValidMaintenanceWorkOrderTransition(workOrder.status, "IN_PROGRESS")) throw new Error(t.validation.maintenanceInvalidTransition);

    // Step 52: startedAt set once - never reset if work goes ON_HOLD and resumes.
    await tx.maintenanceWorkOrder.update({ where: { id: workOrder.id }, data: { status: "IN_PROGRESS", startedAt: workOrder.startedAt ?? new Date() } });

    await auditAction(tx, { action: "UPDATE", entityType: "MaintenanceWorkOrder", entityId: workOrder.id, entityDisplayName: workOrder.workOrderNumber, metadata: { to: "IN_PROGRESS" } });
  });

  revalidatePath(`/operations/maintenance/work-orders/${workOrderId}`);
}

export async function holdWorkOrder(workOrderId: string, formData: FormData): Promise<void> {
  const { organizationId } = await requirePermission("maintenance.workOrder.update");
  const t = getDictionary(await getLocale());

  const holdReasonEnum = z.enum(["WAITING_FOR_PART", "WAITING_FOR_VENDOR", "WAITING_FOR_TENANT", "WAITING_FOR_APPROVAL", "ACCESS_UNAVAILABLE", "OTHER"]);
  const parsed = z.object({ holdReason: holdReasonEnum, holdReasonNote: z.string().optional() }).parse({
    holdReason: formData.get("holdReason"),
    holdReasonNote: formData.get("holdReasonNote") || undefined,
  });

  await prisma.$transaction(async (tx) => {
    const workOrder = await tx.maintenanceWorkOrder.findFirstOrThrow({ where: { id: workOrderId, organizationId } });
    if (!isValidMaintenanceWorkOrderTransition(workOrder.status, "ON_HOLD")) throw new Error(t.validation.maintenanceInvalidTransition);

    await tx.maintenanceWorkOrder.update({ where: { id: workOrder.id }, data: { status: "ON_HOLD", holdReason: parsed.holdReason, holdReasonNote: parsed.holdReasonNote } });

    await tx.maintenanceWorkLog.create({
      data: {
        organizationId,
        workOrderId: workOrder.id,
        logType: "STATUS_UPDATE",
        note: `On hold: ${parsed.holdReason}${parsed.holdReasonNote ? ` - ${parsed.holdReasonNote}` : ""}`,
        createdByUserId: (await requireSession()).user.id,
      },
    });

    await auditAction(tx, { action: "UPDATE", entityType: "MaintenanceWorkOrder", entityId: workOrder.id, entityDisplayName: workOrder.workOrderNumber, metadata: { to: "ON_HOLD", holdReason: parsed.holdReason } });
  });

  revalidatePath(`/operations/maintenance/work-orders/${workOrderId}`);
}

export async function resumeWorkOrder(workOrderId: string): Promise<void> {
  const { organizationId } = await requirePermission("maintenance.workOrder.update");
  const t = getDictionary(await getLocale());
  const { user } = await requireSession();

  await prisma.$transaction(async (tx) => {
    const workOrder = await tx.maintenanceWorkOrder.findFirstOrThrow({ where: { id: workOrderId, organizationId } });
    if (!isValidMaintenanceWorkOrderTransition(workOrder.status, "IN_PROGRESS")) throw new Error(t.validation.maintenanceInvalidTransition);

    // Step 53: SLA clock continues while ON_HOLD in V1 - no pause/resume clock logic here.
    await tx.maintenanceWorkOrder.update({ where: { id: workOrder.id }, data: { status: "IN_PROGRESS", holdReason: null, holdReasonNote: null } });

    await tx.maintenanceWorkLog.create({
      data: { organizationId, workOrderId: workOrder.id, logType: "STATUS_UPDATE", note: "Resumed from hold", createdByUserId: user.id },
    });

    await auditAction(tx, { action: "UPDATE", entityType: "MaintenanceWorkOrder", entityId: workOrder.id, entityDisplayName: workOrder.workOrderNumber, metadata: { to: "IN_PROGRESS" } });
  });

  revalidatePath(`/operations/maintenance/work-orders/${workOrderId}`);
}

export async function diagnoseWorkOrder(workOrderId: string, formData: FormData): Promise<void> {
  const { organizationId } = await requirePermission("maintenance.workOrder.update");
  const t = getDictionary(await getLocale());
  const diagnosis = z.string().min(1, t.validation.nameRequired).parse(formData.get("diagnosis"));

  await prisma.$transaction(async (tx) => {
    const workOrder = await tx.maintenanceWorkOrder.findFirstOrThrow({ where: { id: workOrderId, organizationId } });
    if (isMaintenanceWorkOrderLocked(workOrder.status)) throw new Error(t.validation.maintenanceWorkOrderLocked);

    const before = { diagnosis: workOrder.diagnosis };
    await tx.maintenanceWorkOrder.update({ where: { id: workOrder.id }, data: { diagnosis, diagnosedAt: workOrder.diagnosedAt ?? new Date() } });

    await auditUpdate(tx, { entityType: "MaintenanceWorkOrder", entityId: workOrder.id, entityDisplayName: workOrder.workOrderNumber, before, after: { diagnosis } });
  });

  revalidatePath(`/operations/maintenance/work-orders/${workOrderId}`);
}

export async function completeWorkOrder(workOrderId: string, formData: FormData): Promise<void> {
  const { organizationId } = await requirePermission("maintenance.workOrder.complete");
  const t = getDictionary(await getLocale());

  const parsed = z
    .object({ workPerformed: z.string().min(1), completionNotes: z.string().min(1), requiresFollowUp: z.coerce.boolean().optional() })
    .parse({
      workPerformed: formData.get("workPerformed"),
      completionNotes: formData.get("completionNotes"),
      requiresFollowUp: formData.get("requiresFollowUp") || undefined,
    });

  await prisma.$transaction(async (tx) => {
    const workOrder = await tx.maintenanceWorkOrder.findFirstOrThrow({ where: { id: workOrderId, organizationId } });
    if (!isValidMaintenanceWorkOrderTransition(workOrder.status, "COMPLETED")) throw new Error(t.validation.maintenanceInvalidTransition);

    const validation = validateWorkOrderCompletion({ startedAt: workOrder.startedAt, workPerformed: parsed.workPerformed, completionNotes: parsed.completionNotes });
    if (!validation.canComplete) throw new Error(`${t.validation.maintenanceCompletionMissingRequirements}: ${validation.missing.join(", ")}`);

    await tx.maintenanceWorkOrder.update({
      where: { id: workOrder.id },
      data: { status: "COMPLETED", completedAt: new Date(), workPerformed: parsed.workPerformed, completionNotes: parsed.completionNotes, requiresFollowUp: parsed.requiresFollowUp ?? false },
    });

    await auditAction(tx, { action: "UPDATE", entityType: "MaintenanceWorkOrder", entityId: workOrder.id, entityDisplayName: workOrder.workOrderNumber, metadata: { to: "COMPLETED" } });
  });

  revalidatePath(`/operations/maintenance/work-orders/${workOrderId}`);
}

export async function verifyWorkOrder(workOrderId: string, formData: FormData): Promise<void> {
  const { organizationId } = await requirePermission("maintenance.workOrder.verify");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());
  const verificationNotes = z.string().optional().parse(formData.get("verificationNotes") || undefined);

  await prisma.$transaction(async (tx) => {
    const workOrder = await tx.maintenanceWorkOrder.findFirstOrThrow({ where: { id: workOrderId, organizationId } });
    if (!isValidMaintenanceWorkOrderTransition(workOrder.status, "VERIFIED")) throw new Error(t.validation.maintenanceInvalidTransition);

    await tx.maintenanceWorkOrder.update({
      where: { id: workOrder.id },
      data: { status: "VERIFIED", verifiedAt: workOrder.verifiedAt ?? new Date(), verifiedByUserId: workOrder.verifiedByUserId ?? user.id, verificationNotes },
    });

    await auditAction(tx, { action: "UPDATE", entityType: "MaintenanceWorkOrder", entityId: workOrder.id, entityDisplayName: workOrder.workOrderNumber, metadata: { to: "VERIFIED" } });
  });

  revalidatePath(`/operations/maintenance/work-orders/${workOrderId}`);
}

/** Step 56: VERIFIED -> CLOSED, transactionally resolving the parent Request too. Never reopened afterward (Step 57/58). */
export async function closeWorkOrder(workOrderId: string): Promise<void> {
  const { organizationId } = await requirePermissionAudited("maintenance.workOrder.close", "MaintenanceWorkOrder", workOrderId);
  const t = getDictionary(await getLocale());

  await prisma.$transaction(
    async (tx) => {
      const workOrder = await tx.maintenanceWorkOrder.findFirstOrThrow({ where: { id: workOrderId, organizationId } });
      if (!isValidMaintenanceWorkOrderTransition(workOrder.status, "CLOSED")) throw new Error(t.validation.maintenanceInvalidTransition);

      const closedAt = new Date();
      await tx.maintenanceWorkOrder.update({ where: { id: workOrder.id }, data: { status: "CLOSED", closedAt } });

      const request = await tx.maintenanceRequest.findUniqueOrThrow({ where: { id: workOrder.requestId } });
      if (isValidMaintenanceRequestTransition(request.status, "RESOLVED")) {
        await tx.maintenanceRequest.update({ where: { id: request.id }, data: { status: "RESOLVED", resolvedAt: closedAt } });
        await auditAction(tx, { action: "UPDATE", entityType: "MaintenanceRequest", entityId: request.id, entityDisplayName: request.requestNumber, metadata: { to: "RESOLVED" } });
      }

      await auditAction(tx, { action: "UPDATE", entityType: "MaintenanceWorkOrder", entityId: workOrder.id, entityDisplayName: workOrder.workOrderNumber, metadata: { to: "CLOSED" } });
    },
    { isolationLevel: "Serializable" }
  );

  revalidatePath(`/operations/maintenance/work-orders/${workOrderId}`);
  revalidatePath("/operations/maintenance/requests");
}

export async function cancelWorkOrder(workOrderId: string, formData: FormData): Promise<void> {
  const { organizationId } = await requirePermissionAudited("maintenance.workOrder.cancel", "MaintenanceWorkOrder", workOrderId);
  const t = getDictionary(await getLocale());

  const parsed = z.object({ cancelReason: cancelReasonEnum, cancelReasonNote: z.string().optional() }).parse({
    cancelReason: formData.get("cancelReason"),
    cancelReasonNote: formData.get("cancelReasonNote") || undefined,
  });

  await prisma.$transaction(
    async (tx) => {
      const workOrder = await tx.maintenanceWorkOrder.findFirstOrThrow({ where: { id: workOrderId, organizationId } });
      if (!isValidMaintenanceWorkOrderTransition(workOrder.status, "CANCELLED")) throw new Error(t.validation.maintenanceInvalidTransition);

      await tx.maintenanceWorkOrder.update({
        where: { id: workOrder.id },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: parsed.cancelReason, cancelReasonNote: parsed.cancelReasonNote },
      });

      // Step 17: a cancelled Work Order re-opens the door for a follow-up -
      // move the Request back to TRIAGED so createWorkOrderFromRequest() can
      // run again, unless something else already resolved/cancelled it.
      const request = await tx.maintenanceRequest.findUniqueOrThrow({ where: { id: workOrder.requestId } });
      if (request.status === "WORK_ORDER_CREATED") {
        const otherActive = await tx.maintenanceWorkOrder.findMany({ where: { organizationId, requestId: request.id, id: { not: workOrder.id } }, select: { status: true } });
        if (!otherActive.some((w) => blocksNewWorkOrderForRequest(w.status))) {
          await tx.maintenanceRequest.update({ where: { id: request.id }, data: { status: "TRIAGED" } });
        }
      }

      await auditAction(tx, { action: "CANCEL", entityType: "MaintenanceWorkOrder", entityId: workOrder.id, entityDisplayName: workOrder.workOrderNumber, metadata: { cancelReason: parsed.cancelReason } });
    },
    { isolationLevel: "Serializable" }
  );

  revalidatePath(`/operations/maintenance/work-orders/${workOrderId}`);
  revalidatePath("/operations/maintenance/requests");
}

// ---------------------------------------------------------------------------
// Work Logs / Labor / Parts / Other Costs (Step 30-35)
// ---------------------------------------------------------------------------

async function recomputeActualCost(tx: Prisma.TransactionClient, organizationId: string, workOrderId: string) {
  const [laborEntries, partEntries, costEntries] = await Promise.all([
    tx.maintenanceLaborEntry.findMany({ where: { organizationId, workOrderId }, select: { cost: true } }),
    tx.maintenancePartEntry.findMany({ where: { organizationId, workOrderId }, select: { totalCost: true } }),
    tx.maintenanceCostEntry.findMany({ where: { organizationId, workOrderId }, select: { amount: true } }),
  ]);
  const summary = computeMaintenanceCostSummary(laborEntries, partEntries, costEntries);
  await tx.maintenanceWorkOrder.update({ where: { id: workOrderId }, data: { actualCost: summary.actualCost } });
  return summary;
}

export async function addWorkLog(workOrderId: string, formData: FormData): Promise<void> {
  const { organizationId } = await requirePermission("maintenance.workOrder.update");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const logTypeEnum = z.enum(["NOTE", "STATUS_UPDATE", "DIAGNOSIS", "WORK_PERFORMED", "CUSTOMER_UPDATE", "INTERNAL_NOTE", "OTHER"]);
  const parsed = z.object({ logType: logTypeEnum.default("NOTE"), note: z.string().min(1, t.validation.nameRequired) }).parse({
    logType: formData.get("logType") || undefined,
    note: formData.get("note"),
  });

  const workOrder = await prisma.maintenanceWorkOrder.findFirstOrThrow({ where: { id: workOrderId, organizationId } });
  if (isMaintenanceWorkOrderLocked(workOrder.status)) throw new Error(t.validation.maintenanceWorkOrderLocked);

  // Step 78: Work Log is operational history, deliberately not audited -
  // routine notes must not create audit-log noise.
  await prisma.maintenanceWorkLog.create({ data: { organizationId, workOrderId, logType: parsed.logType, note: parsed.note, createdByUserId: user.id } });

  revalidatePath(`/operations/maintenance/work-orders/${workOrderId}`);
}

export async function addLaborEntry(workOrderId: string, formData: FormData): Promise<void> {
  const { organizationId } = await requirePermission("maintenance.cost.manage");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const parsed = z
    .object({
      userId: z.string().optional(),
      vendorId: z.string().optional(),
      description: z.string().min(1, t.validation.nameRequired),
      hours: z.coerce.number().nonnegative(t.validation.maintenanceLaborHoursNonNegative),
      hourlyRate: z.coerce.number().nonnegative(t.validation.maintenanceAmountNonNegative).optional(),
      cost: z.coerce.number().nonnegative(t.validation.maintenanceAmountNonNegative).optional(),
      workDate: z.coerce.date(),
    })
    .parse({
      userId: formData.get("userId") || undefined,
      vendorId: formData.get("vendorId") || undefined,
      description: formData.get("description"),
      hours: formData.get("hours"),
      hourlyRate: formData.get("hourlyRate") || undefined,
      cost: formData.get("cost") || undefined,
      workDate: formData.get("workDate"),
    });

  await prisma.$transaction(async (tx) => {
    const workOrder = await tx.maintenanceWorkOrder.findFirstOrThrow({ where: { id: workOrderId, organizationId } });
    if (isMaintenanceWorkOrderLocked(workOrder.status)) throw new Error(t.validation.maintenanceWorkOrderLocked);

    // Step 85: cost is always server-computed - hours x rate when a rate is
    // given, otherwise the caller's explicit flat cost, never trusted blindly.
    const computed = computeLaborCost(parsed.hours, parsed.hourlyRate ?? null);
    const cost = computed ?? new Prisma.Decimal(parsed.cost ?? 0);

    await tx.maintenanceLaborEntry.create({
      data: {
        organizationId,
        workOrderId,
        userId: parsed.userId,
        vendorId: parsed.vendorId,
        description: parsed.description,
        hours: parsed.hours,
        hourlyRate: parsed.hourlyRate,
        cost,
        workDate: parsed.workDate,
        createdByUserId: user.id,
      },
    });

    await recomputeActualCost(tx, organizationId, workOrderId);
    await auditAction(tx, { action: "CREATE", entityType: "MaintenanceLaborEntry", entityId: workOrderId, entityDisplayName: workOrder.workOrderNumber, metadata: { description: parsed.description, cost: cost.toString() } });
  });

  revalidatePath(`/operations/maintenance/work-orders/${workOrderId}`);
}

export async function addPartEntry(workOrderId: string, formData: FormData): Promise<void> {
  const { organizationId } = await requirePermission("maintenance.cost.manage");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const parsed = z
    .object({
      itemName: z.string().min(1, t.validation.nameRequired),
      quantity: z.coerce.number().int().positive(t.validation.maintenancePartQuantityPositive),
      unitCost: z.coerce.number().nonnegative(t.validation.maintenanceAmountNonNegative),
      supplierName: z.string().optional(),
      reference: z.string().optional(),
    })
    .parse({
      itemName: formData.get("itemName"),
      quantity: formData.get("quantity"),
      unitCost: formData.get("unitCost"),
      supplierName: formData.get("supplierName") || undefined,
      reference: formData.get("reference") || undefined,
    });

  await prisma.$transaction(async (tx) => {
    const workOrder = await tx.maintenanceWorkOrder.findFirstOrThrow({ where: { id: workOrderId, organizationId } });
    if (isMaintenanceWorkOrderLocked(workOrder.status)) throw new Error(t.validation.maintenanceWorkOrderLocked);

    // Step 32/85: totalCost is always quantity x unitCost, server-computed - never trusted from the client.
    const totalCost = computePartTotalCost(parsed.quantity, parsed.unitCost);

    await tx.maintenancePartEntry.create({
      data: { organizationId, workOrderId, itemName: parsed.itemName, quantity: parsed.quantity, unitCost: parsed.unitCost, totalCost, supplierName: parsed.supplierName, reference: parsed.reference, createdByUserId: user.id },
    });

    await recomputeActualCost(tx, organizationId, workOrderId);
    await auditAction(tx, { action: "CREATE", entityType: "MaintenancePartEntry", entityId: workOrderId, entityDisplayName: workOrder.workOrderNumber, metadata: { itemName: parsed.itemName, totalCost: totalCost.toString() } });
  });

  revalidatePath(`/operations/maintenance/work-orders/${workOrderId}`);
}

export async function addCostEntry(workOrderId: string, formData: FormData): Promise<void> {
  const { organizationId } = await requirePermission("maintenance.cost.manage");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const costTypeEnum = z.enum(["TRANSPORT", "EXTERNAL_SERVICE", "EQUIPMENT_RENTAL", "MISCELLANEOUS", "OTHER"]);
  const parsed = z
    .object({
      costType: costTypeEnum,
      description: z.string().min(1, t.validation.nameRequired),
      amount: z.coerce.number().nonnegative(t.validation.maintenanceAmountNonNegative),
      reference: z.string().optional(),
      date: z.coerce.date(),
    })
    .parse({
      costType: formData.get("costType"),
      description: formData.get("description"),
      amount: formData.get("amount"),
      reference: formData.get("reference") || undefined,
      date: formData.get("date"),
    });

  await prisma.$transaction(async (tx) => {
    const workOrder = await tx.maintenanceWorkOrder.findFirstOrThrow({ where: { id: workOrderId, organizationId } });
    if (isMaintenanceWorkOrderLocked(workOrder.status)) throw new Error(t.validation.maintenanceWorkOrderLocked);

    await tx.maintenanceCostEntry.create({
      data: { organizationId, workOrderId, costType: parsed.costType, description: parsed.description, amount: parsed.amount, reference: parsed.reference, date: parsed.date, createdByUserId: user.id },
    });

    await recomputeActualCost(tx, organizationId, workOrderId);
    await auditAction(tx, { action: "CREATE", entityType: "MaintenanceCostEntry", entityId: workOrderId, entityDisplayName: workOrder.workOrderNumber, metadata: { description: parsed.description, amount: parsed.amount } });
  });

  revalidatePath(`/operations/maintenance/work-orders/${workOrderId}`);
}

/** Preliminary operational classification only (Step 36) - never creates an accounting entry. */
export async function setWorkOrderCostResponsibility(workOrderId: string, costResponsibility: MaintenanceCostResponsibility): Promise<void> {
  const { organizationId } = await requirePermission("maintenance.cost.manage");
  const t = getDictionary(await getLocale());

  const workOrder = await prisma.maintenanceWorkOrder.findFirst({ where: { id: workOrderId, organizationId } });
  if (!workOrder) throw new Error(t.validation.maintenanceUnitNotFound);
  if (isMaintenanceWorkOrderLocked(workOrder.status)) throw new Error(t.validation.maintenanceWorkOrderLocked);

  await prisma.maintenanceWorkOrder.update({ where: { id: workOrderId }, data: { costResponsibility } });
  revalidatePath(`/operations/maintenance/work-orders/${workOrderId}`);
}

// ---------------------------------------------------------------------------
// Work Order: get / list
// ---------------------------------------------------------------------------

function withWorkOrderCostSummary<T extends { estimatedCost: Prisma.Decimal | null; actualCost: Prisma.Decimal | null; laborEntries?: { cost: Prisma.Decimal }[]; partEntries?: { totalCost: Prisma.Decimal }[]; costEntries?: { amount: Prisma.Decimal }[] }>(
  row: T
) {
  const summary = computeMaintenanceCostSummary(row.laborEntries ?? [], row.partEntries ?? [], row.costEntries ?? []);
  const variance = computeCostVariance(row.estimatedCost, summary.actualCost);
  return { ...row, costSummary: summary, costVariance: variance };
}

export async function getMaintenanceWorkOrderById(id: string) {
  const { organizationId } = await requirePermission("maintenance.view");
  const workOrder = await prisma.maintenanceWorkOrder.findFirstOrThrow({ where: { id, organizationId }, include: WORK_ORDER_FULL_INCLUDE });
  return withWorkOrderCostSummary(workOrder);
}

export interface MaintenanceWorkOrderListFilters {
  page?: number;
  search?: string;
  status?: string;
  priority?: string;
  compoundId?: string;
  buildingId?: string;
  unitId?: string;
  assignedToUserId?: string;
  vendorId?: string;
  overdueOnly?: boolean;
}

export async function listMaintenanceWorkOrders(filters: MaintenanceWorkOrderListFilters = {}) {
  const { organizationId } = await requirePermission("maintenance.view");
  const page = Math.max(1, filters.page ?? 1);

  const where: Prisma.MaintenanceWorkOrderWhereInput = {
    organizationId,
    status: (filters.status as MaintenanceWorkOrderStatus) || undefined,
    priority: (filters.priority as MaintenancePriority) || undefined,
    assignedToUserId: filters.assignedToUserId || undefined,
    vendorId: filters.vendorId || undefined,
    request: filters.compoundId || filters.buildingId || filters.unitId ? { compoundId: filters.compoundId || undefined, buildingId: filters.buildingId || undefined, unitId: filters.unitId || undefined } : undefined,
    ...(filters.search ? { workOrderNumber: { contains: filters.search, mode: "insensitive" as const } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.maintenanceWorkOrder.findMany({ where, include: WORK_ORDER_LIST_INCLUDE, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.maintenanceWorkOrder.count({ where }),
  ]);

  let withOverdue = rows.map((r) => ({ ...r, overdue: isMaintenanceWorkOrderOverdue(null, r.status) }));
  if (filters.overdueOnly) withOverdue = withOverdue.filter((r) => r.overdue);

  return { rows: withOverdue, total, page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

// ---------------------------------------------------------------------------
// Vendors (Step 19-21/73)
// ---------------------------------------------------------------------------

export async function createVendor(formData: FormData): Promise<string> {
  const { organizationId } = await requirePermission("maintenance.vendor.manage");
  const t = getDictionary(await getLocale());

  const parsed = z
    .object({
      name: z.string().min(1, t.validation.nameRequired),
      nameAr: z.string().optional(),
      contactPerson: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      notes: z.string().optional(),
      specialties: z.array(categoryEnum).default([]),
    })
    .parse({
      name: formData.get("name"),
      nameAr: formData.get("nameAr") || undefined,
      contactPerson: formData.get("contactPerson") || undefined,
      phone: formData.get("phone") || undefined,
      email: formData.get("email") || undefined,
      notes: formData.get("notes") || undefined,
      specialties: formData.getAll("specialties"),
    });

  const vendorId = await prisma.$transaction(async (tx) => {
    const seq = await nextCounterValue(tx, organizationId, "maintenanceVendor");
    const vendorNumber = formatMaintenanceVendorNumber(seq);

    const created = await tx.maintenanceVendor.create({
      data: { organizationId, vendorNumber, name: parsed.name, nameAr: parsed.nameAr, contactPerson: parsed.contactPerson, phone: parsed.phone, email: parsed.email, notes: parsed.notes },
    });

    if (parsed.specialties.length > 0) {
      await tx.maintenanceVendorSpecialty.createMany({ data: parsed.specialties.map((category) => ({ vendorId: created.id, category })) });
    }

    await auditCreate(tx, { entityType: "MaintenanceVendor", entityId: created.id, entityDisplayName: created.name, newValues: { name: created.name, vendorNumber: created.vendorNumber } });

    return created.id;
  });

  revalidatePath("/operations/maintenance/vendors");
  return vendorId;
}

export async function updateVendor(vendorId: string, formData: FormData): Promise<void> {
  const { organizationId } = await requirePermission("maintenance.vendor.manage");
  const t = getDictionary(await getLocale());

  const parsed = z
    .object({
      name: z.string().min(1, t.validation.nameRequired),
      nameAr: z.string().optional(),
      contactPerson: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      notes: z.string().optional(),
      specialties: z.array(categoryEnum).default([]),
    })
    .parse({
      name: formData.get("name"),
      nameAr: formData.get("nameAr") || undefined,
      contactPerson: formData.get("contactPerson") || undefined,
      phone: formData.get("phone") || undefined,
      email: formData.get("email") || undefined,
      notes: formData.get("notes") || undefined,
      specialties: formData.getAll("specialties"),
    });

  await prisma.$transaction(async (tx) => {
    const vendor = await tx.maintenanceVendor.findFirstOrThrow({ where: { id: vendorId, organizationId } });
    const before = { name: vendor.name, contactPerson: vendor.contactPerson, phone: vendor.phone, email: vendor.email };

    await tx.maintenanceVendor.update({
      where: { id: vendorId },
      data: { name: parsed.name, nameAr: parsed.nameAr, contactPerson: parsed.contactPerson, phone: parsed.phone, email: parsed.email, notes: parsed.notes },
    });

    await tx.maintenanceVendorSpecialty.deleteMany({ where: { vendorId } });
    if (parsed.specialties.length > 0) {
      await tx.maintenanceVendorSpecialty.createMany({ data: parsed.specialties.map((category) => ({ vendorId, category })) });
    }

    await auditUpdate(tx, { entityType: "MaintenanceVendor", entityId: vendorId, entityDisplayName: parsed.name, before, after: { name: parsed.name, contactPerson: parsed.contactPerson, phone: parsed.phone, email: parsed.email } });
  });

  revalidatePath(`/operations/maintenance/vendors/${vendorId}`);
  revalidatePath("/operations/maintenance/vendors");
}

export async function setVendorActive(vendorId: string, active: boolean): Promise<void> {
  const { organizationId } = await requirePermission("maintenance.vendor.manage");
  const vendor = await prisma.maintenanceVendor.findFirstOrThrow({ where: { id: vendorId, organizationId } });

  await prisma.$transaction(async (tx) => {
    await tx.maintenanceVendor.update({ where: { id: vendorId }, data: { active } });
    await auditAction(tx, { action: active ? "ACTIVATE" : "DEACTIVATE", entityType: "MaintenanceVendor", entityId: vendorId, entityDisplayName: vendor.name });
  });

  revalidatePath(`/operations/maintenance/vendors/${vendorId}`);
  revalidatePath("/operations/maintenance/vendors");
}

export async function getVendorById(id: string) {
  const { organizationId } = await requirePermission("maintenance.vendor.view");
  return prisma.maintenanceVendor.findFirstOrThrow({
    where: { id, organizationId },
    include: { specialties: true, workOrders: { include: { request: { select: { requestNumber: true, title: true } } }, orderBy: { createdAt: "desc" } } },
  });
}

export interface VendorListFilters {
  page?: number;
  search?: string;
  activeOnly?: boolean;
}

export async function listVendors(filters: VendorListFilters = {}) {
  const { organizationId } = await requirePermission("maintenance.vendor.view");
  const page = Math.max(1, filters.page ?? 1);

  const where: Prisma.MaintenanceVendorWhereInput = {
    organizationId,
    active: filters.activeOnly ? true : undefined,
    ...(filters.search
      ? { OR: [{ name: { contains: filters.search, mode: "insensitive" as const } }, { vendorNumber: { contains: filters.search, mode: "insensitive" as const } }] }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.maintenanceVendor.findMany({ where, include: { specialties: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.maintenanceVendor.count({ where }),
  ]);

  return { rows, total, page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

// ---------------------------------------------------------------------------
// Attachment metadata (Step 37-38) - metadata only, mirrors MoveInAttachment.
// ---------------------------------------------------------------------------

export async function addMaintenanceAttachmentMetadata(formData: FormData): Promise<void> {
  const { organizationId } = await requirePermission("maintenance.workOrder.update");
  const { user } = await requireSession();
  const t = getDictionary(await getLocale());

  const attachmentTypeEnum = z.enum(["PHOTO", "VIDEO", "DOCUMENT", "INVOICE_COPY", "QUOTE", "OTHER"]);
  const stageEnum = z.enum(["BEFORE", "DURING", "AFTER", "GENERAL"]);

  const parsed = z
    .object({
      requestId: z.string().optional(),
      workOrderId: z.string().optional(),
      workLogId: z.string().optional(),
      attachmentType: attachmentTypeEnum,
      stage: stageEnum.default("GENERAL"),
      fileName: z.string().min(1, t.validation.nameRequired),
      mimeType: z.string().min(1),
      fileSize: z.coerce.number().optional(),
      caption: z.string().optional(),
    })
    .parse({
      requestId: formData.get("requestId") || undefined,
      workOrderId: formData.get("workOrderId") || undefined,
      workLogId: formData.get("workLogId") || undefined,
      attachmentType: formData.get("attachmentType"),
      stage: formData.get("stage") || undefined,
      fileName: formData.get("fileName"),
      mimeType: formData.get("mimeType"),
      fileSize: formData.get("fileSize") || undefined,
      caption: formData.get("caption") || undefined,
    });

  await prisma.maintenanceAttachment.create({
    data: {
      organizationId,
      requestId: parsed.requestId,
      workOrderId: parsed.workOrderId,
      workLogId: parsed.workLogId,
      attachmentType: parsed.attachmentType,
      stage: parsed.stage,
      fileName: parsed.fileName,
      mimeType: parsed.mimeType,
      fileSize: parsed.fileSize,
      caption: parsed.caption,
      uploadedByUserId: user.id,
    },
  });

  if (parsed.requestId) revalidatePath(`/operations/maintenance/requests/${parsed.requestId}`);
  if (parsed.workOrderId) revalidatePath(`/operations/maintenance/work-orders/${parsed.workOrderId}`);
}

// ---------------------------------------------------------------------------
// Dashboard KPIs (Step 62/63) - bounded/aggregate queries only.
// ---------------------------------------------------------------------------

export async function getMaintenanceDashboardKpis() {
  const { organizationId } = await requirePermission("maintenance.view");

  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const startOfNextMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);

  const [openRequests, emergencyRequests, inProgress, onHold, completedAwaitingVerification, closedThisMonth, costAggregate] = await Promise.all([
    prisma.maintenanceRequest.count({ where: { organizationId, status: { notIn: ["RESOLVED", "CANCELLED"] } } }),
    prisma.maintenanceRequest.count({ where: { organizationId, priority: "EMERGENCY", status: { notIn: ["RESOLVED", "CANCELLED"] } } }),
    prisma.maintenanceWorkOrder.count({ where: { organizationId, status: "IN_PROGRESS" } }),
    prisma.maintenanceWorkOrder.count({ where: { organizationId, status: "ON_HOLD" } }),
    prisma.maintenanceWorkOrder.count({ where: { organizationId, status: "COMPLETED" } }),
    prisma.maintenanceWorkOrder.count({ where: { organizationId, status: "CLOSED", closedAt: { gte: startOfMonth, lt: startOfNextMonth } } }),
    prisma.maintenanceWorkOrder.aggregate({ where: { organizationId, closedAt: { gte: startOfMonth, lt: startOfNextMonth } }, _sum: { actualCost: true } }),
  ]);

  // SLA-breached count needs the due-date/response comparison, so it's
  // computed over a bounded (not-yet-resolved) set only - never the whole
  // table - then filtered in-process against the same pure formula the
  // rest of the app uses.
  const openWithSla = await prisma.maintenanceRequest.findMany({
    where: { organizationId, status: { notIn: ["RESOLVED", "CANCELLED"] } },
    select: { reportedAt: true, responseDueAt: true, resolutionDueAt: true, firstResponseAt: true, resolvedAt: true, status: true },
  });
  const slaBreached = openWithSla.filter((r) => {
    const response = computeResponseSlaStatus({ reportedAt: r.reportedAt, responseDueAt: r.responseDueAt, firstResponseAt: r.firstResponseAt });
    const resolution = computeResolutionSlaStatus({ reportedAt: r.reportedAt, resolutionDueAt: r.resolutionDueAt, resolvedAt: r.resolvedAt, requestStatus: r.status });
    return computeOverallSlaStatus(response, resolution) === "BREACHED";
  }).length;

  return {
    openRequests,
    emergencyRequests,
    slaBreached,
    workOrdersInProgress: inProgress,
    workOrdersOnHold: onHold,
    completedAwaitingVerification,
    closedThisMonth,
    maintenanceCostThisMonth: costAggregate._sum.actualCost ?? new Prisma.Decimal(0),
  };
}

/** Nested Compound -> Building -> Floor -> Unit tree (Step 43's cascading location picker for UNIT-scope requests) - extends getLocationTree()'s own shape (src/lib/actions/floors.ts) with the leaf Units, since a Maintenance Request needs an existing Unit, not a Floor to attach a new one to. */
export async function getMaintenanceLocationTree() {
  const { organizationId } = await requirePermission("maintenance.request.create");
  return prisma.compound.findMany({
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
            select: {
              id: true,
              name: true,
              nameAr: true,
              floorNumber: true,
              units: { select: { id: true, unitNumber: true }, orderBy: { unitNumber: "asc" } },
            },
            orderBy: { floorNumber: "asc" },
          },
        },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });
}

/** Compounds/Buildings for BUILDING_COMMON_AREA/COMPOUND_COMMON_AREA scope pickers. */
export async function getMaintenanceCompoundsAndBuildings() {
  const { organizationId } = await requirePermission("maintenance.request.create");
  return prisma.compound.findMany({
    where: { organizationId },
    select: { id: true, name: true, arabicName: true, buildings: { select: { id: true, name: true, nameAr: true }, orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
}

/** Active Contracts for a given Unit (Step 12's optional Contract/Renter linkage) - only ACTIVE contracts, since a maintenance request links a *current* tenancy, not history. */
export async function getActiveContractsForUnit(unitId: string) {
  const { organizationId } = await requirePermission("maintenance.request.create");
  return prisma.contract.findMany({
    where: { organizationId, unitId, status: "ACTIVE" },
    select: { id: true, contractNumber: true, renterId: true, renter: { select: { id: true, fullName: true, fullNameAr: true } } },
  });
}

/** Internal users eligible for assignment (Step 18) - same organization, active only. */
export async function listAssignableUsers() {
  const { organizationId } = await requirePermission("maintenance.view");
  return prisma.user.findMany({ where: { organizationId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

/** Unit profile integration (Step 69) - bounded, never a full history load. */
export async function getUnitMaintenanceSummary(unitId: string) {
  const { organizationId } = await requirePermission("maintenance.view");
  const [openCount, recent] = await Promise.all([
    prisma.maintenanceRequest.count({ where: { organizationId, unitId, status: { notIn: ["RESOLVED", "CANCELLED"] } } }),
    prisma.maintenanceRequest.findMany({ where: { organizationId, unitId }, orderBy: { reportedAt: "desc" }, take: 5, select: { id: true, requestNumber: true, title: true, status: true, reportedAt: true } }),
  ]);
  return { openCount, recent, lastMaintenanceDate: recent[0]?.reportedAt ?? null };
}
