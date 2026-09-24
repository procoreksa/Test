"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireSession } from "@/lib/session";
import { auditUpdate, auditAction } from "@/lib/audit";
import { getLocale, getDictionary } from "@/lib/i18n";
import type { AutomationJobStatus, AutomationJobType, CommunicationOutboxEventStatus, CommunicationEventType } from "@prisma/client";

const PAGE_SIZE = 25;

/**
 * Step 38 - every tenant-facing reminder type defaults DISABLED until an
 * OWNER/ADMIN explicitly enables it per organization. An organization with
 * no AutomationSettings row yet (never visited /automation/settings) reads
 * as "everything off", never as "everything on by omission."
 */
const DEFAULT_AUTOMATION_SETTINGS = {
  rentReminderEnabled: false,
  contractExpiryReminderEnabled: false,
  moveInReminderEnabled: false,
  moveOutReminderEnabled: false,
  maintenanceSlaAutomationEnabled: false,
} as const;

export interface AutomationSettingsDTO {
  rentReminderEnabled: boolean;
  contractExpiryReminderEnabled: boolean;
  moveInReminderEnabled: boolean;
  moveOutReminderEnabled: boolean;
  maintenanceSlaAutomationEnabled: boolean;
  updatedAt: Date | null;
}

export async function getAutomationSettings(): Promise<AutomationSettingsDTO> {
  const { organizationId } = await requirePermission("automation.settings.view");

  const settings = await prisma.automationSettings.findUnique({ where: { organizationId } });
  if (!settings) return { ...DEFAULT_AUTOMATION_SETTINGS, updatedAt: null };

  return {
    rentReminderEnabled: settings.rentReminderEnabled,
    contractExpiryReminderEnabled: settings.contractExpiryReminderEnabled,
    moveInReminderEnabled: settings.moveInReminderEnabled,
    moveOutReminderEnabled: settings.moveOutReminderEnabled,
    maintenanceSlaAutomationEnabled: settings.maintenanceSlaAutomationEnabled,
    updatedAt: settings.updatedAt,
  };
}

export interface UpdateAutomationSettingsInput {
  rentReminderEnabled: boolean;
  contractExpiryReminderEnabled: boolean;
  moveInReminderEnabled: boolean;
  moveOutReminderEnabled: boolean;
  maintenanceSlaAutomationEnabled: boolean;
}

/**
 * Step 38/97 - the ONLY way an organization's tenant-facing reminders turn
 * on. OWNER/ADMIN-only (enforced by `automation.settings.update`), and every
 * change is audited (Step 97: automation-setting changes are one of the few
 * automation events worth an AuditLog row, unlike a routine scheduler tick).
 */
export async function updateAutomationSettings(input: UpdateAutomationSettingsInput): Promise<void> {
  const { organizationId } = await requirePermission("automation.settings.update");
  const { user } = await requireSession();

  await prisma.$transaction(async (tx) => {
    const existing = await tx.automationSettings.findUnique({ where: { organizationId } });
    const before = existing
      ? {
          rentReminderEnabled: existing.rentReminderEnabled,
          contractExpiryReminderEnabled: existing.contractExpiryReminderEnabled,
          moveInReminderEnabled: existing.moveInReminderEnabled,
          moveOutReminderEnabled: existing.moveOutReminderEnabled,
          maintenanceSlaAutomationEnabled: existing.maintenanceSlaAutomationEnabled,
        }
      : { ...DEFAULT_AUTOMATION_SETTINGS };

    const after = await tx.automationSettings.upsert({
      where: { organizationId },
      create: { organizationId, updatedByUserId: user.id, ...input },
      update: { updatedByUserId: user.id, ...input },
    });

    await auditUpdate(tx, {
      entityType: "AutomationSettings",
      entityId: after.id,
      entityDisplayName: "Automation Settings",
      before,
      after: { ...input },
    });
  });

  revalidatePath("/automation/settings");
  revalidatePath("/automation");
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface AutomationDashboard {
  pendingJobs: number;
  runningJobs: number;
  failedJobs: number;
  completedToday: number;
  outboxPending: number;
  outboxFailed: number;
  communicationQueue: number;
  lastSchedulerRunAt: Date | null;
}

/**
 * Step 60 - the operator's single "is automation healthy" view: Pending/
 * Running/Failed/Completed-Today jobs, Outbox Pending/Failed, the existing
 * Communication delivery queue depth, and when the scheduler last ran
 * (Critical Principle 7 - "no silent automation"). Every count is scoped to
 * the caller's own organization except `lastSchedulerRunAt`, which is a
 * system-level operational timestamp carrying no business data.
 */
export async function getAutomationDashboard(): Promise<AutomationDashboard> {
  const { organizationId } = await requirePermission("automation.view");

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [pendingJobs, runningJobs, failedJobs, completedToday, outboxPending, outboxFailed, communicationQueue, lastRun] = await Promise.all([
    prisma.automationJob.count({ where: { organizationId, status: "PENDING" } }),
    prisma.automationJob.count({ where: { organizationId, status: "RUNNING" } }),
    prisma.automationJob.count({ where: { organizationId, status: "FAILED" } }),
    prisma.automationJob.count({ where: { organizationId, status: "COMPLETED", completedAt: { gte: startOfToday } } }),
    prisma.communicationOutboxEvent.count({ where: { organizationId, status: "PENDING" } }),
    prisma.communicationOutboxEvent.count({ where: { organizationId, status: "FAILED" } }),
    prisma.communicationMessage.count({ where: { organizationId, status: "QUEUED" } }),
    prisma.automationSchedulerRun.findFirst({ orderBy: { ranAt: "desc" }, select: { ranAt: true } }),
  ]);

  return { pendingJobs, runningJobs, failedJobs, completedToday, outboxPending, outboxFailed, communicationQueue, lastSchedulerRunAt: lastRun?.ranAt ?? null };
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export interface AutomationJobListFilters {
  status?: AutomationJobStatus;
  jobType?: AutomationJobType;
  page?: number;
}

export async function listAutomationJobs(filters: AutomationJobListFilters = {}) {
  const { organizationId } = await requirePermission("automation.job.view");
  const page = Math.max(1, filters.page ?? 1);

  const where = {
    organizationId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.jobType ? { jobType: filters.jobType } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.automationJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        jobType: true,
        status: true,
        scheduledFor: true,
        attemptCount: true,
        maxAttempts: true,
        lastErrorMessage: true,
        createdAt: true,
      },
    }),
    prisma.automationJob.count({ where }),
  ]);

  return { rows, total, page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getAutomationJobById(jobId: string) {
  const { organizationId } = await requirePermission("automation.job.view");
  const t = getDictionary(await getLocale());

  const job = await prisma.automationJob.findUnique({
    where: { id: jobId, organizationId },
    include: { attempts: { orderBy: { attemptNumber: "asc" } } },
  });
  if (!job) throw new Error(t.automation.jobNotFound);
  return job;
}

/**
 * Step 45/59 - manual retry for a FAILED job only, OWNER/ADMIN/MANAGER per
 * RBAC. `attemptCount` is deliberately NOT reset (same convention as
 * `retryCommunicationMessage()`) - the existing max-attempts check in the
 * worker applies unchanged to the next attempt, so a manual retry can never
 * grant infinite additional attempts. Never re-runs the handler itself here
 * - only re-queues it for the worker to claim, exactly like every other
 * automated retry (no special "manual execution" path that could duplicate
 * a business side effect the worker's own idempotent handler already
 * guards against).
 */
export async function retryAutomationJob(jobId: string): Promise<void> {
  const { organizationId } = await requirePermission("automation.job.retry");
  const t = getDictionary(await getLocale());

  const claim = await prisma.automationJob.updateMany({
    where: { id: jobId, organizationId, status: "FAILED" },
    data: { status: "PENDING", availableAt: new Date(), lockedAt: null, lockedBy: null, lastErrorCode: null, lastErrorMessage: null },
  });
  if (claim.count !== 1) throw new Error(t.automation.cannotRetryNotFailed);

  const job = await prisma.automationJob.findUniqueOrThrow({ where: { id: jobId } });
  await auditAction(prisma, {
    action: "UPDATE",
    entityType: "AutomationJob",
    entityId: jobId,
    entityDisplayName: `${job.jobType} / ${job.jobKey}`,
    newValues: { status: "PENDING", manualRetry: true },
  });

  revalidatePath("/automation/jobs");
  revalidatePath(`/automation/jobs/${jobId}`);
}

/**
 * Step 45 - cancellation restricted to semantically-safe PENDING jobs only
 * (never RUNNING/FAILED/COMPLETED) - a scheduled-but-not-yet-executed job is
 * the one state where "this should simply never happen" is a safe,
 * side-effect-free outcome.
 */
export async function cancelAutomationJob(jobId: string): Promise<void> {
  const { organizationId } = await requirePermission("automation.job.cancel");
  const t = getDictionary(await getLocale());

  const claim = await prisma.automationJob.updateMany({
    where: { id: jobId, organizationId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  if (claim.count !== 1) throw new Error(t.automation.cannotCancelNotPending);

  const job = await prisma.automationJob.findUniqueOrThrow({ where: { id: jobId } });
  await auditAction(prisma, {
    action: "CANCEL",
    entityType: "AutomationJob",
    entityId: jobId,
    entityDisplayName: `${job.jobType} / ${job.jobKey}`,
  });

  revalidatePath("/automation/jobs");
  revalidatePath(`/automation/jobs/${jobId}`);
}

// ---------------------------------------------------------------------------
// Outbox
// ---------------------------------------------------------------------------

export interface OutboxEventListFilters {
  status?: CommunicationOutboxEventStatus;
  eventType?: CommunicationEventType;
  page?: number;
}

export async function listOutboxEvents(filters: OutboxEventListFilters = {}) {
  const { organizationId } = await requirePermission("automation.outbox.view");
  const page = Math.max(1, filters.page ?? 1);

  const where = {
    organizationId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.eventType ? { eventType: filters.eventType } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.communicationOutboxEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        eventType: true,
        status: true,
        availableAt: true,
        attemptCount: true,
        maxAttempts: true,
        lastErrorMessage: true,
        createdAt: true,
      },
    }),
    prisma.communicationOutboxEvent.count({ where }),
  ]);

  return { rows, total, page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/**
 * Step 45 - manual retry for a FAILED outbox event only. There is
 * deliberately no cancel action for an outbox event (unlike a scheduled
 * job): an outbox event represents a business fact that already happened
 * (an Invoice was issued, a Payment was received) - cancelling it would
 * mean permanently suppressing a notification for something real, which is
 * never semantically safe the way cancelling a not-yet-executed reminder
 * is (Step 45's own distinction).
 */
export async function retryOutboxEvent(eventId: string): Promise<void> {
  const { organizationId } = await requirePermission("automation.outbox.retry");
  const t = getDictionary(await getLocale());

  const claim = await prisma.communicationOutboxEvent.updateMany({
    where: { id: eventId, organizationId, status: "FAILED" },
    data: { status: "PENDING", availableAt: new Date(), lockedAt: null, lockedBy: null, lastErrorCode: null, lastErrorMessage: null },
  });
  if (claim.count !== 1) throw new Error(t.automation.cannotRetryOutboxNotFailed);

  const event = await prisma.communicationOutboxEvent.findUniqueOrThrow({ where: { id: eventId } });
  await auditAction(prisma, {
    action: "UPDATE",
    entityType: "CommunicationOutboxEvent",
    entityId: eventId,
    entityDisplayName: `${event.eventType} / ${event.eventKey}`,
    newValues: { status: "PENDING", manualRetry: true },
  });

  revalidatePath("/automation/outbox");
}
