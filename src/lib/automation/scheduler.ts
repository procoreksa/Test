import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { zonedStartOfDayOffset, zonedDateKey } from "./timezone";
import { rentDueReminderKey, contractExpiryReminderKey, moveInReminderKey, moveOutReminderKey, maintenanceSlaCheckKey } from "./job-keys";
import {
  RENT_DUE_REMINDER_OFFSETS_DAYS,
  CONTRACT_EXPIRY_REMINDER_OFFSETS_DAYS,
  MOVE_IN_REMINDER_OFFSET_DAYS,
  MOVE_OUT_REMINDER_OFFSET_DAYS,
  SCHEDULER_LOOKAHEAD_DAYS,
} from "./reminder-offsets";
import type { RentDueReminderPayload } from "./handlers/rent-due-reminder";
import type { ContractExpiryReminderPayload } from "./handlers/contract-expiry-reminder";
import type { MoveInReminderPayload } from "./handlers/move-in-reminder";
import type { MoveOutReminderPayload } from "./handlers/move-out-reminder";
import type { MaintenanceSlaCheckPayload } from "./handlers/maintenance-sla-check";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A fireDate further than this in the past never gets a freshly-created job (Step 16's historical-safety concern, applied to the scheduler) - an org that just enabled a reminder does not suddenly blast reminders for months-old due dates it never saw before. Already-created jobs are unaffected (idempotency key match, not this check). */
export const PAST_GRACE_DAYS = 14;

export function withinSchedulingWindow(fireDate: Date, now: Date): boolean {
  const upper = now.getTime() + SCHEDULER_LOOKAHEAD_DAYS * DAY_MS;
  const lower = now.getTime() - PAST_GRACE_DAYS * DAY_MS;
  return fireDate.getTime() >= lower && fireDate.getTime() <= upper;
}

/** Insert-or-skip: the DB-unique `(organizationId, jobType, jobKey)` constraint is the actual idempotency guarantee (Step 19/81) - this just makes "already exists" a silent no-op instead of a thrown error, exactly like `emitCommunicationEventTx()`'s own P2002 handling. */
async function createJobIdempotent(data: Prisma.AutomationJobUncheckedCreateInput): Promise<boolean> {
  try {
    await prisma.automationJob.create({ data });
    return true;
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002") return false;
    throw error;
  }
}

export interface RunAutomationSchedulerResult {
  rentDueReminderJobsCreated: number;
  contractExpiryReminderJobsCreated: number;
  moveInReminderJobsCreated: number;
  moveOutReminderJobsCreated: number;
  maintenanceSlaCheckJobsCreated: number;
}

/**
 * Step 20 - the scheduler: discovers authoritative records that need a
 * scheduled job and inserts any missing ones. Never claims or executes a
 * job itself (that is the worker's job, src/lib/automation/worker.ts).
 * Running this twice (or two overlapping invocations - Step 81) creates
 * zero duplicate jobs: every insert goes through the same DB-unique
 * `(organizationId, jobType, jobKey)` constraint the AutomationJob schema
 * enforces.
 *
 * Iterates only organizations that have at least one reminder type enabled
 * (Step 38's opt-in default) and scopes every query by that organization's
 * own id (Critical Principle: multi-tenancy, Step 69) - never a
 * cross-organization query.
 */
export async function runAutomationScheduler(now: Date = new Date()): Promise<RunAutomationSchedulerResult> {
  const settingsRows = await prisma.automationSettings.findMany({
    where: {
      OR: [
        { rentReminderEnabled: true },
        { contractExpiryReminderEnabled: true },
        { moveInReminderEnabled: true },
        { moveOutReminderEnabled: true },
        { maintenanceSlaAutomationEnabled: true },
      ],
    },
    include: { organization: { select: { id: true, timezone: true } } },
  });

  const result: RunAutomationSchedulerResult = {
    rentDueReminderJobsCreated: 0,
    contractExpiryReminderJobsCreated: 0,
    moveInReminderJobsCreated: 0,
    moveOutReminderJobsCreated: 0,
    maintenanceSlaCheckJobsCreated: 0,
  };

  for (const settings of settingsRows) {
    const { organizationId } = settings;
    const timezone = settings.organization.timezone;

    if (settings.rentReminderEnabled) {
      result.rentDueReminderJobsCreated += await discoverRentDueReminderJobs(organizationId, timezone, now);
    }
    if (settings.contractExpiryReminderEnabled) {
      result.contractExpiryReminderJobsCreated += await discoverContractExpiryReminderJobs(organizationId, timezone, now);
    }
    if (settings.moveInReminderEnabled) {
      result.moveInReminderJobsCreated += await discoverMoveInReminderJobs(organizationId, timezone, now);
    }
    if (settings.moveOutReminderEnabled) {
      result.moveOutReminderJobsCreated += await discoverMoveOutReminderJobs(organizationId, timezone, now);
    }
    if (settings.maintenanceSlaAutomationEnabled) {
      result.maintenanceSlaCheckJobsCreated += await discoverMaintenanceSlaCheckJobs(organizationId, timezone, now);
    }
  }

  // Critical Principle 7 ("no silent automation") - a durable record that
  // this invocation happened, so /automation's dashboard can answer "did
  // the scheduler run, and when" from the database rather than from
  // ephemeral route-response logs. Never read by any handler - purely
  // operational/observability.
  await prisma.automationSchedulerRun.create({ data: { ranAt: now, resultJson: result as unknown as Prisma.InputJsonValue } });

  return result;
}

async function discoverRentDueReminderJobs(organizationId: string, timezone: string, now: Date): Promise<number> {
  const schedules = await prisma.paymentSchedule.findMany({
    where: {
      organizationId,
      status: { notIn: ["PAID", "CANCELLED"] },
      dueDate: { gte: new Date(now.getTime() - (PAST_GRACE_DAYS + 10) * DAY_MS), lte: new Date(now.getTime() + (SCHEDULER_LOOKAHEAD_DAYS + 10) * DAY_MS) },
    },
    select: { id: true, dueDate: true },
  });

  let created = 0;
  for (const schedule of schedules) {
    for (const offsetDays of RENT_DUE_REMINDER_OFFSETS_DAYS) {
      const fireDate = zonedStartOfDayOffset(schedule.dueDate, offsetDays, timezone);
      if (!withinSchedulingWindow(fireDate, now)) continue;
      const payload: RentDueReminderPayload = { scheduleId: schedule.id, offsetDays, dueDate: schedule.dueDate.toISOString() };
      const inserted = await createJobIdempotent({
        organizationId,
        jobType: "RENT_DUE_REMINDER",
        jobKey: rentDueReminderKey(schedule.id, offsetDays, schedule.dueDate),
        scheduledFor: fireDate,
        availableAt: fireDate,
        payloadVersion: 1,
        payloadJson: payload as unknown as Prisma.InputJsonValue,
      });
      if (inserted) created++;
    }
  }
  return created;
}

async function discoverContractExpiryReminderJobs(organizationId: string, timezone: string, now: Date): Promise<number> {
  const maxOffset = Math.max(...CONTRACT_EXPIRY_REMINDER_OFFSETS_DAYS);
  const contracts = await prisma.contract.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      endDate: { gte: new Date(now.getTime() - PAST_GRACE_DAYS * DAY_MS), lte: new Date(now.getTime() + (SCHEDULER_LOOKAHEAD_DAYS + maxOffset) * DAY_MS) },
    },
    select: { id: true, endDate: true },
  });

  let created = 0;
  for (const contract of contracts) {
    for (const offsetDays of CONTRACT_EXPIRY_REMINDER_OFFSETS_DAYS) {
      const fireDate = zonedStartOfDayOffset(contract.endDate, -offsetDays, timezone);
      if (!withinSchedulingWindow(fireDate, now)) continue;
      const payload: ContractExpiryReminderPayload = { contractId: contract.id, offsetDays, endDate: contract.endDate.toISOString() };
      const inserted = await createJobIdempotent({
        organizationId,
        jobType: "CONTRACT_EXPIRY_REMINDER",
        jobKey: contractExpiryReminderKey(contract.id, offsetDays, contract.endDate),
        scheduledFor: fireDate,
        availableAt: fireDate,
        payloadVersion: 1,
        payloadJson: payload as unknown as Prisma.InputJsonValue,
      });
      if (inserted) created++;
    }
  }
  return created;
}

async function discoverMoveInReminderJobs(organizationId: string, timezone: string, now: Date): Promise<number> {
  const moveIns = await prisma.moveIn.findMany({
    where: {
      organizationId,
      status: "SCHEDULED",
      scheduledAt: { not: null, gte: new Date(now.getTime() - PAST_GRACE_DAYS * DAY_MS), lte: new Date(now.getTime() + (SCHEDULER_LOOKAHEAD_DAYS + MOVE_IN_REMINDER_OFFSET_DAYS) * DAY_MS) },
    },
    select: { id: true, scheduledAt: true },
  });

  let created = 0;
  for (const moveIn of moveIns) {
    if (!moveIn.scheduledAt) continue;
    const fireDate = zonedStartOfDayOffset(moveIn.scheduledAt, -MOVE_IN_REMINDER_OFFSET_DAYS, timezone);
    if (!withinSchedulingWindow(fireDate, now)) continue;
    const payload: MoveInReminderPayload = { moveInId: moveIn.id, offsetDays: MOVE_IN_REMINDER_OFFSET_DAYS, scheduledAt: moveIn.scheduledAt.toISOString() };
    const inserted = await createJobIdempotent({
      organizationId,
      jobType: "MOVE_IN_REMINDER",
      jobKey: moveInReminderKey(moveIn.id, MOVE_IN_REMINDER_OFFSET_DAYS, moveIn.scheduledAt),
      scheduledFor: fireDate,
      availableAt: fireDate,
      payloadVersion: 1,
      payloadJson: payload as unknown as Prisma.InputJsonValue,
    });
    if (inserted) created++;
  }
  return created;
}

async function discoverMoveOutReminderJobs(organizationId: string, timezone: string, now: Date): Promise<number> {
  const moveOuts = await prisma.moveOut.findMany({
    where: {
      organizationId,
      status: "SCHEDULED",
      scheduledAt: { not: null, gte: new Date(now.getTime() - PAST_GRACE_DAYS * DAY_MS), lte: new Date(now.getTime() + (SCHEDULER_LOOKAHEAD_DAYS + MOVE_OUT_REMINDER_OFFSET_DAYS) * DAY_MS) },
    },
    select: { id: true, scheduledAt: true },
  });

  let created = 0;
  for (const moveOut of moveOuts) {
    if (!moveOut.scheduledAt) continue;
    const fireDate = zonedStartOfDayOffset(moveOut.scheduledAt, -MOVE_OUT_REMINDER_OFFSET_DAYS, timezone);
    if (!withinSchedulingWindow(fireDate, now)) continue;
    const payload: MoveOutReminderPayload = { moveOutId: moveOut.id, offsetDays: MOVE_OUT_REMINDER_OFFSET_DAYS, scheduledAt: moveOut.scheduledAt.toISOString() };
    const inserted = await createJobIdempotent({
      organizationId,
      jobType: "MOVE_OUT_REMINDER",
      jobKey: moveOutReminderKey(moveOut.id, MOVE_OUT_REMINDER_OFFSET_DAYS, moveOut.scheduledAt),
      scheduledFor: fireDate,
      availableAt: fireDate,
      payloadVersion: 1,
      payloadJson: payload as unknown as Prisma.InputJsonValue,
    });
    if (inserted) created++;
  }
  return created;
}

/** One job per (request, calendar day) while the request remains open and is within a day of, or past, either SLA due date - Step 35's dedupe cadence. */
async function discoverMaintenanceSlaCheckJobs(organizationId: string, timezone: string, now: Date): Promise<number> {
  const warnHorizon = new Date(now.getTime() + DAY_MS);
  const requests = await prisma.maintenanceRequest.findMany({
    where: {
      organizationId,
      status: { notIn: ["RESOLVED", "CANCELLED"] },
      OR: [{ responseDueAt: { lte: warnHorizon } }, { resolutionDueAt: { lte: warnHorizon } }],
    },
    select: { id: true },
  });

  const todayKey = zonedDateKey(now, timezone);
  const fireDate = zonedStartOfDayOffset(now, 0, timezone);

  let created = 0;
  for (const request of requests) {
    const payload: MaintenanceSlaCheckPayload = { requestId: request.id };
    const inserted = await createJobIdempotent({
      organizationId,
      jobType: "MAINTENANCE_SLA_CHECK",
      jobKey: maintenanceSlaCheckKey(request.id, todayKey),
      scheduledFor: fireDate,
      availableAt: fireDate,
      payloadVersion: 1,
      payloadJson: payload as unknown as Prisma.InputJsonValue,
    });
    if (inserted) created++;
  }
  return created;
}
