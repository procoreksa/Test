import { prisma } from "@/lib/prisma";
import { computeResponseSlaStatus, computeResolutionSlaStatus, computeOverallSlaStatus } from "@/lib/operations/maintenance-rules";
import type { AutomationHandler } from "../handler-types";

export interface MaintenanceSlaCheckPayload {
  requestId: string;
}

export function isMaintenanceSlaCheckPayload(payload: unknown): payload is MaintenanceSlaCheckPayload {
  return typeof payload === "object" && payload !== null && typeof (payload as Record<string, unknown>).requestId === "string";
}

/**
 * Step 34/35 - reuses the exact same SLA formulas
 * (`computeResponseSlaStatus()`/`computeResolutionSlaStatus()`/
 * `computeOverallSlaStatus()`, src/lib/operations/maintenance-rules.ts)
 * `getMaintenanceDashboardKpis()` already uses - never a second SLA engine.
 * Never auto-completes or otherwise mutates the Work Order (Step 34).
 *
 * V1 scope decision (documented, not an oversight): no
 * `MAINTENANCE_SLA_BREACHED` CommunicationEventType exists yet, so this
 * handler is detection-only in this phase - it proves out the full
 * AutomationJob mechanics (idempotent one-job-per-request-per-day dedupe
 * via `maintenanceSlaCheckKey()`, stale-completion skip, reuse of the real
 * SLA formulas) as the foundation for a future staff-facing alert, without
 * emitting a notification. See docs/AUTOMATION-SCHEDULED-JOBS.md
 * "Maintenance SLA automation."
 */
export const maintenanceSlaCheckHandler: AutomationHandler = async (ctx) => {
  if (!isMaintenanceSlaCheckPayload(ctx.payloadJson)) {
    return { kind: "PERMANENT_FAILURE", errorCode: "INVALID_PAYLOAD", errorMessage: "maintenance-sla-check payload is missing requestId" };
  }
  const payload = ctx.payloadJson;

  const request = await prisma.maintenanceRequest.findFirst({
    where: { id: payload.requestId, organizationId: ctx.organizationId },
    select: { status: true, reportedAt: true, responseDueAt: true, resolutionDueAt: true, firstResponseAt: true, resolvedAt: true },
  });
  if (!request) return { kind: "SKIPPED", reason: "MaintenanceRequest no longer exists" };
  if (request.status === "RESOLVED" || request.status === "CANCELLED") {
    return { kind: "SKIPPED", reason: `request status is now ${request.status} - SLA no longer applies` };
  }

  // Detection only in V1 (see module doc comment) - the computed status is
  // intentionally not persisted or acted on beyond proving the job ran.
  const response = computeResponseSlaStatus({ reportedAt: request.reportedAt, responseDueAt: request.responseDueAt, firstResponseAt: request.firstResponseAt });
  const resolution = computeResolutionSlaStatus({ reportedAt: request.reportedAt, resolutionDueAt: request.resolutionDueAt, resolvedAt: request.resolvedAt, requestStatus: request.status });
  computeOverallSlaStatus(response, resolution);

  return { kind: "COMPLETED" };
};
