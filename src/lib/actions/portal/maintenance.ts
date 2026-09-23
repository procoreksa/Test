"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenantSession, requireTenantPrincipal, requireTenantMaintenanceAccess } from "@/lib/tenant-session";
import { getLocale, getDictionary } from "@/lib/i18n";
import { nextCounterValue, formatMaintenanceRequestNumber } from "@/lib/numbering";
import { computeSlaDueDates } from "@/lib/operations/maintenance-rules";
import { isTenantCancellableMaintenanceStatus } from "@/lib/portal/tenancy-rules";
import { selectCurrentTenancy } from "@/lib/portal/tenancy-rules";

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

const createSchema = z.object({
  category: categoryEnum,
  priority: priorityEnum.default("NORMAL"),
  title: z.string().min(1),
  description: z.string().optional(),
  preferredVisitDate: z.coerce.date().optional(),
  preferredTimeWindow: z.string().optional(),
  permissionToEnter: z.coerce.boolean().optional(),
});

/**
 * Step 29/30/33/68 - the one mutation a tenant may perform. Every location/
 * ownership field (organizationId, renterId, contractId, unitId) is
 * DERIVED from the authenticated tenant's own current tenancy - none of
 * them is ever read from `formData`, so there is nothing for a hostile
 * client to inject (Step 68's relation-injection test targets exactly
 * this: the form literally has no unitId/contractId/renterId/
 * organizationId input to tamper with). No assignedToUserId, vendor, or
 * cost field is ever settable here either - internal triage
 * (maintenance.request.triage) remains the only path to any of those
 * (Step 31/50).
 */
export async function createTenantMaintenanceRequest(formData: FormData): Promise<string> {
  const { organizationId, renterId } = await requireTenantPrincipal();
  const t = getDictionary(await getLocale());
  const parsed = createSchema.parse({
    category: formData.get("category"),
    priority: formData.get("priority") || undefined,
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    preferredVisitDate: formData.get("preferredVisitDate") || undefined,
    preferredTimeWindow: formData.get("preferredTimeWindow") || undefined,
    permissionToEnter: formData.get("permissionToEnter") || undefined,
  });

  const contracts = await prisma.contract.findMany({
    where: { organizationId, renterId },
    select: { id: true, status: true, startDate: true, endDate: true, unitId: true },
  });
  const { current } = selectCurrentTenancy(contracts);
  if (!current || current.status !== "ACTIVE") throw new Error(t.tenantPortal.noActiveTenancy);

  const requestId = await prisma.$transaction(
    async (tx) => {
      const reportedAt = new Date();
      const { responseDueAt, resolutionDueAt } = computeSlaDueDates(reportedAt, parsed.priority);
      const seq = await nextCounterValue(tx, organizationId, "maintenanceRequest");
      const requestNumber = formatMaintenanceRequestNumber(seq);

      const created = await tx.maintenanceRequest.create({
        data: {
          organizationId,
          requestNumber,
          scopeType: "UNIT",
          unitId: current.unitId,
          contractId: current.id,
          renterId,
          category: parsed.category,
          priority: parsed.priority,
          status: "OPEN",
          title: parsed.title,
          description: parsed.description,
          reportedByType: "TENANT",
          reportedAt,
          preferredVisitDate: parsed.preferredVisitDate,
          preferredTimeWindow: parsed.preferredTimeWindow,
          permissionToEnter: parsed.permissionToEnter,
          source: "TENANT",
          responseDueAt,
          resolutionDueAt,
          // Plain string, not a relation (MaintenanceRequest.createdByUserId
          // has no FK) - the tenant account id traces this request back to
          // its origin without fabricating an internal User row (Step 83).
          createdByUserId: `tenant:${(await tx.tenantPortalAccount.findUniqueOrThrow({ where: { renterId }, select: { id: true } })).id}`,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId: null,
          userEmail: null,
          userRole: "TENANT",
          action: "CREATE",
          entityType: "MaintenanceRequest",
          entityId: created.id,
          entityDisplayName: created.requestNumber,
          newValues: { category: created.category, priority: created.priority, source: "TENANT" },
        },
      });

      return created.id;
    },
    { isolationLevel: "Serializable" }
  );

  revalidatePath("/portal/maintenance");
  revalidatePath("/portal");
  return requestId;
}

const MAINTENANCE_REQUEST_SELECT = {
  id: true,
  requestNumber: true,
  category: true,
  priority: true,
  status: true,
  title: true,
  description: true,
  reportedAt: true,
  preferredVisitDate: true,
  preferredTimeWindow: true,
  resolvedAt: true,
  cancelledAt: true,
  workOrders: { select: { id: true, workOrderNumber: true, status: true, scheduledStart: true, scheduledEnd: true, completionNotes: true } },
} as const;

export async function getTenantMaintenanceRequests() {
  const { organizationId, renterId } = await requireTenantPrincipal();
  return prisma.maintenanceRequest.findMany({
    where: { organizationId, renterId },
    orderBy: { reportedAt: "desc" },
    select: MAINTENANCE_REQUEST_SELECT,
  });
}

export async function getTenantMaintenanceRequestDetail(requestId: string) {
  await requireTenantMaintenanceAccess(requestId);
  const { organizationId, renterId } = await requireTenantPrincipal();
  const request = await prisma.maintenanceRequest.findFirstOrThrow({ where: { id: requestId, organizationId, renterId }, select: MAINTENANCE_REQUEST_SELECT });
  return { request, cancellable: isTenantCancellableMaintenanceStatus(request.status) };
}

const cancelSchema = z.object({ requestId: z.string().min(1) });

/** Step 37 - only while OPEN (isTenantCancellableMaintenanceStatus); a dedicated action, never a generic status-update endpoint the tenant could otherwise misuse. */
export async function cancelTenantMaintenanceRequest(formData: FormData) {
  await requireTenantSession();
  const t = getDictionary(await getLocale());
  const parsed = cancelSchema.parse({ requestId: formData.get("requestId") });
  const { request } = await requireTenantMaintenanceAccess(parsed.requestId);

  if (!isTenantCancellableMaintenanceStatus(request.status)) throw new Error(t.tenantPortal.maintenanceNotCancellable);

  await prisma.$transaction(async (tx) => {
    await tx.maintenanceRequest.update({ where: { id: request.id }, data: { status: "CANCELLED", cancelReason: "TENANT_WITHDREW", cancelledAt: new Date() } });
    await tx.auditLog.create({
      data: {
        organizationId: request.organizationId,
        userId: null,
        userEmail: null,
        userRole: "TENANT",
        action: "CANCEL",
        entityType: "MaintenanceRequest",
        entityId: request.id,
        entityDisplayName: request.requestNumber,
        previousValues: { status: request.status },
        newValues: { status: "CANCELLED" },
      },
    });
  });

  revalidatePath("/portal/maintenance");
}
