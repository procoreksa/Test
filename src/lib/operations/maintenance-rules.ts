/**
 * Pure, DB-free Maintenance Management business rules (same pattern as
 * src/lib/operations/move-in-rules.ts / src/lib/crm/viewing-rules.ts) -
 * status-transition legality for both MaintenanceRequest and
 * MaintenanceWorkOrder, the centralized SLA policy and its derived status
 * formulas, Decimal-safe operational cost calculations, scheduling overlap
 * detection, and completion validation all live here. The actual Prisma
 * queries (including resolveMaintenanceLocation(), which needs the
 * database to verify the Unit/Building/Compound/Contract/Renter hierarchy)
 * live in src/lib/operations/maintenance-location.ts and
 * src/lib/actions/maintenance.ts. See docs/MAINTENANCE-MANAGEMENT.md for
 * the full design.
 */
import { Prisma } from "@prisma/client";
import type { MaintenanceRequestStatus, MaintenanceWorkOrderStatus, MaintenancePriority } from "@prisma/client";

// ---------------------------------------------------------------------------
// MaintenanceRequest status transitions (Step 8/16/47/57/59)
// ---------------------------------------------------------------------------
const MAINTENANCE_REQUEST_TRANSITIONS: Record<MaintenanceRequestStatus, readonly MaintenanceRequestStatus[]> = {
  OPEN: ["TRIAGED", "CANCELLED"],
  // A Request may return to TRIAGED from WORK_ORDER_CREATED when its one
  // active Work Order was itself cancelled before completion - this is
  // what makes a legitimate follow-up Work Order possible (Step 17)
  // without ever collapsing back to OPEN (the Request has already been
  // triaged once; firstResponseAt/SLA targets are frozen and untouched).
  TRIAGED: ["WORK_ORDER_CREATED", "CANCELLED"],
  WORK_ORDER_CREATED: ["RESOLVED", "TRIAGED"],
  // Terminal (Step 57: no reopen in V1 - a recurring issue gets a new Request).
  RESOLVED: [],
  CANCELLED: [],
};

export function isValidMaintenanceRequestTransition(from: MaintenanceRequestStatus, to: MaintenanceRequestStatus): boolean {
  return MAINTENANCE_REQUEST_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * One-active-Work-Order-per-Request rule (Step 17), mirroring
 * blocksNewMoveInForContract()/blocksNewReservationForOffer()'s own
 * app-layer-predicate-in-a-Serializable-transaction precedent exactly - a
 * Request may accumulate several CANCELLED Work Order attempts before a
 * successful one, but never two simultaneously live ones.
 */
export function blocksNewWorkOrderForRequest(status: MaintenanceWorkOrderStatus): boolean {
  return status !== "CANCELLED";
}

// ---------------------------------------------------------------------------
// MaintenanceWorkOrder status transitions (Step 15/52/53/55/56/57/58/59)
// ---------------------------------------------------------------------------
const MAINTENANCE_WORK_ORDER_TRANSITIONS: Record<MaintenanceWorkOrderStatus, readonly MaintenanceWorkOrderStatus[]> = {
  DRAFT: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  SCHEDULED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["ON_HOLD", "COMPLETED", "CANCELLED"],
  ON_HOLD: ["IN_PROGRESS", "CANCELLED"],
  // COMPLETED (technician says work is finished) is deliberately distinct
  // from VERIFIED (authorized staff confirms resolution) - Step 55. Step 59
  // permits Work Order cancellation "before CLOSED", which literally
  // includes COMPLETED and VERIFIED.
  COMPLETED: ["VERIFIED", "CANCELLED"],
  VERIFIED: ["CLOSED", "CANCELLED"],
  // Terminal (Step 57/58: CLOSED history is protected, never reopened).
  CLOSED: [],
  CANCELLED: [],
};

export function isValidMaintenanceWorkOrderTransition(from: MaintenanceWorkOrderStatus, to: MaintenanceWorkOrderStatus): boolean {
  return MAINTENANCE_WORK_ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

/** CLOSED Work Orders are immutable operational history (Step 58) - diagnosis/workPerformed/labor/parts/costs/assignment/schedule may never be mutated once CLOSED. */
export function isMaintenanceWorkOrderLocked(status: MaintenanceWorkOrderStatus): boolean {
  return status === "CLOSED";
}

// ---------------------------------------------------------------------------
// SLA policy (Step 25) - centralized defaults by priority. Explicitly NOT
// universal legal/business truths (per the brief's own caution) - kept in
// exactly one place so nothing scatters hardcoded SLA minutes elsewhere.
// ---------------------------------------------------------------------------
export interface SlaTargetMinutes {
  responseMinutes: number;
  resolutionMinutes: number;
}

export const SLA_POLICY: Record<MaintenancePriority, SlaTargetMinutes> = {
  EMERGENCY: { responseMinutes: 15, resolutionMinutes: 4 * 60 },
  URGENT: { responseMinutes: 60, resolutionMinutes: 8 * 60 },
  HIGH: { responseMinutes: 4 * 60, resolutionMinutes: 24 * 60 },
  NORMAL: { responseMinutes: 8 * 60, resolutionMinutes: 72 * 60 },
  LOW: { responseMinutes: 24 * 60, resolutionMinutes: 120 * 60 },
};

/**
 * Computes both due timestamps once, from `reportedAt` + the policy for
 * `priority`, at Request-creation time. The caller persists the result on
 * MaintenanceRequest.responseDueAt/resolutionDueAt and never recomputes it
 * later (Step 26/47: "freeze original SLA targets once Request is
 * created" - a later priority change or a future policy update must not
 * rewrite an already-created Request's targets).
 */
export function computeSlaDueDates(reportedAt: Date, priority: MaintenancePriority): { responseDueAt: Date; resolutionDueAt: Date } {
  const policy = SLA_POLICY[priority];
  return {
    responseDueAt: new Date(reportedAt.getTime() + policy.responseMinutes * 60_000),
    resolutionDueAt: new Date(reportedAt.getTime() + policy.resolutionMinutes * 60_000),
  };
}

export type SlaStatus = "ON_TRACK" | "AT_RISK" | "BREACHED" | "MET";

/**
 * Not specified by the brief - a reasonable, centralized default: once 75%
 * of the time-to-due window has elapsed with no response/resolution yet,
 * flag AT_RISK rather than silently staying ON_TRACK until the exact
 * due instant. Adjustable in exactly one place.
 */
const AT_RISK_THRESHOLD = 0.75;

function computeApproachingStatus(windowStart: Date, dueAt: Date, now: Date): "ON_TRACK" | "AT_RISK" {
  const totalMs = dueAt.getTime() - windowStart.getTime();
  if (totalMs <= 0) return "AT_RISK";
  const elapsedMs = now.getTime() - windowStart.getTime();
  return elapsedMs / totalMs >= AT_RISK_THRESHOLD ? "AT_RISK" : "ON_TRACK";
}

export interface ResponseSlaInput {
  reportedAt: Date;
  responseDueAt: Date | null;
  firstResponseAt: Date | null;
  now?: Date;
}

/**
 * Response breached = now > responseDueAt AND firstResponseAt is null
 * (Step 27's own formula, for a still-unanswered Request). Once a first
 * response has actually happened, the same due timestamp instead tells us
 * whether that historical response was on time (MET) or late (BREACHED) -
 * needed for the SLA Performance Report's "Response SLA Met/Breached"
 * counts (Step 65), which must reflect the actual response instant, not
 * just "has it happened yet."
 */
export function computeResponseSlaStatus(input: ResponseSlaInput): SlaStatus {
  if (!input.responseDueAt) return "ON_TRACK";
  if (input.firstResponseAt) {
    return input.firstResponseAt <= input.responseDueAt ? "MET" : "BREACHED";
  }
  const now = input.now ?? new Date();
  if (now > input.responseDueAt) return "BREACHED";
  return computeApproachingStatus(input.reportedAt, input.responseDueAt, now);
}

export interface ResolutionSlaInput {
  reportedAt: Date;
  resolutionDueAt: Date | null;
  resolvedAt: Date | null;
  requestStatus: MaintenanceRequestStatus;
  now?: Date;
}

/**
 * Resolution breached = now > resolutionDueAt AND the Request is not yet
 * resolved/cancelled (Step 27's own formula). Returns null for a CANCELLED
 * Request: it was never resolved, so it must never count as "met" (Step
 * 65's explicit denominator warning), but it also was not left to overrun
 * a deadline - it is simply out of scope for this metric. Callers
 * aggregating a report must treat null as excluded from both the met and
 * breached counts, not as either.
 */
export function computeResolutionSlaStatus(input: ResolutionSlaInput): SlaStatus | null {
  if (input.requestStatus === "CANCELLED") return null;
  if (!input.resolutionDueAt) return "ON_TRACK";
  if (input.requestStatus === "RESOLVED" && input.resolvedAt) {
    return input.resolvedAt <= input.resolutionDueAt ? "MET" : "BREACHED";
  }
  const now = input.now ?? new Date();
  if (now > input.resolutionDueAt) return "BREACHED";
  return computeApproachingStatus(input.reportedAt, input.resolutionDueAt, now);
}

const SLA_STATUS_SEVERITY: Record<SlaStatus, number> = { MET: 0, ON_TRACK: 1, AT_RISK: 2, BREACHED: 3 };

/** Single combined status for a list-page badge (Step 61) - the worse of the two component statuses, so a Request that has responded on time but is at risk of missing resolution still shows AT_RISK, not MET. */
export function computeOverallSlaStatus(response: SlaStatus, resolution: SlaStatus | null): SlaStatus {
  if (resolution === null) return response;
  return SLA_STATUS_SEVERITY[response] >= SLA_STATUS_SEVERITY[resolution] ? response : resolution;
}

// ---------------------------------------------------------------------------
// Scheduling (Step 23/24)
// ---------------------------------------------------------------------------
export function isValidWorkOrderSchedule(scheduledStart: Date, scheduledEnd: Date): boolean {
  return scheduledEnd > scheduledStart;
}

/**
 * Two time ranges overlap iff each starts before the other ends - same
 * formula/boundary convention as src/lib/crm/viewing-rules.ts'
 * hasTimeOverlap() (back-to-back windows do not overlap).
 */
export function hasScheduleOverlap(existingStart: Date, existingEnd: Date, newStart: Date, newEnd: Date): boolean {
  return existingStart < newEnd && existingEnd > newStart;
}

/**
 * Only these statuses represent a real, still-active commitment of an
 * internal technician's time (Step 24) - COMPLETED/VERIFIED/CLOSED/
 * CANCELLED Work Orders free up their schedule slot entirely.
 */
export const SCHEDULE_BLOCKING_WORK_ORDER_STATUSES: readonly MaintenanceWorkOrderStatus[] = [
  "ASSIGNED",
  "SCHEDULED",
  "IN_PROGRESS",
  "ON_HOLD",
];

export function isScheduleBlockingWorkOrderStatus(status: MaintenanceWorkOrderStatus): boolean {
  return SCHEDULE_BLOCKING_WORK_ORDER_STATUSES.includes(status);
}

// ---------------------------------------------------------------------------
// Overdue (list/report filters, Step 45/50)
// ---------------------------------------------------------------------------
export function isMaintenanceRequestOverdue(resolutionDueAt: Date | null, status: MaintenanceRequestStatus, now: Date = new Date()): boolean {
  if (!resolutionDueAt) return false;
  return resolutionDueAt < now && status !== "RESOLVED" && status !== "CANCELLED";
}

export function isMaintenanceWorkOrderOverdue(resolutionDueAt: Date | null, status: MaintenanceWorkOrderStatus, now: Date = new Date()): boolean {
  if (!resolutionDueAt) return false;
  return resolutionDueAt < now && status !== "CLOSED" && status !== "CANCELLED";
}

// ---------------------------------------------------------------------------
// Operational cost calculation (Step 31/32/33/34/35) - Decimal throughout,
// never JS floating-point arithmetic. Deliberately named "operational" -
// this NEVER produces an accounting figure and is never posted anywhere.
// ---------------------------------------------------------------------------
export function computePartTotalCost(quantity: number, unitCost: Prisma.Decimal | number | string): Prisma.Decimal {
  return new Prisma.Decimal(unitCost).times(quantity);
}

/** Returns null when no hourly rate is given - the caller (server action) then requires an explicit `cost` value from the form instead (e.g. a flat fee), never defaulting to zero. */
export function computeLaborCost(hours: Prisma.Decimal | number | string, hourlyRate: Prisma.Decimal | number | string | null): Prisma.Decimal | null {
  if (hourlyRate === null) return null;
  return new Prisma.Decimal(hourlyRate).times(hours);
}

export interface MaintenanceCostSummary {
  laborCost: Prisma.Decimal;
  partsCost: Prisma.Decimal;
  otherCost: Prisma.Decimal;
  actualCost: Prisma.Decimal;
}

/** Labor + Parts + Other = Actual Maintenance Cost (Step 34) - the single authoritative aggregation, recomputed server-side on every entry mutation and cached onto MaintenanceWorkOrder.actualCost. */
export function computeMaintenanceCostSummary(
  laborEntries: readonly { cost: Prisma.Decimal }[],
  partEntries: readonly { totalCost: Prisma.Decimal }[],
  costEntries: readonly { amount: Prisma.Decimal }[]
): MaintenanceCostSummary {
  const laborCost = laborEntries.reduce((sum, e) => sum.plus(e.cost), new Prisma.Decimal(0));
  const partsCost = partEntries.reduce((sum, e) => sum.plus(e.totalCost), new Prisma.Decimal(0));
  const otherCost = costEntries.reduce((sum, e) => sum.plus(e.amount), new Prisma.Decimal(0));
  return { laborCost, partsCost, otherCost, actualCost: laborCost.plus(partsCost).plus(otherCost) };
}

/** Estimated vs. Actual variance (Step 35) - operational only, never "profit/loss." Null when no estimate was given. */
export function computeCostVariance(estimatedCost: Prisma.Decimal | null, actualCost: Prisma.Decimal): Prisma.Decimal | null {
  if (estimatedCost === null) return null;
  return actualCost.minus(estimatedCost);
}

// ---------------------------------------------------------------------------
// Work Order completion validation (Step 54) - the single centralized gate
// completeWorkOrder() runs before writing COMPLETED. Deliberately does NOT
// require cost entries or a minimum cost ("some maintenance is internal/
// no-cost").
// ---------------------------------------------------------------------------
export type WorkOrderMissingRequirement = "NOT_STARTED" | "WORK_PERFORMED_REQUIRED" | "COMPLETION_NOTES_REQUIRED";

export interface WorkOrderCompletionInput {
  startedAt: Date | null;
  workPerformed: string | null;
  completionNotes: string | null;
}

export function validateWorkOrderCompletion(input: WorkOrderCompletionInput): { canComplete: boolean; missing: WorkOrderMissingRequirement[] } {
  const missing: WorkOrderMissingRequirement[] = [];
  if (!input.startedAt) missing.push("NOT_STARTED");
  if (!input.workPerformed || input.workPerformed.trim().length === 0) missing.push("WORK_PERFORMED_REQUIRED");
  if (!input.completionNotes || input.completionNotes.trim().length === 0) missing.push("COMPLETION_NOTES_REQUIRED");
  return { canComplete: missing.length === 0, missing };
}

// ---------------------------------------------------------------------------
// Recurring issue foundation (Step 68) - no AI, just a same-Unit +
// same-Category count within a window. The actual grouped query lives in
// the reports action; this just centralizes "what counts as recurring."
// ---------------------------------------------------------------------------
export const RECURRING_ISSUE_MIN_COUNT = 3;
