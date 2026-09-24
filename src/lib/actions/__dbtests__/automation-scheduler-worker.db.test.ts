/**
 * Real, database-backed tests for the scheduler/worker mechanics
 * (docs/AUTOMATION-SCHEDULED-JOBS.md): idempotent duplicate scheduler runs,
 * the mandatory execution-time eligibility recheck (a job valid when
 * scheduled but no longer eligible at execution time skips silently rather
 * than notifying stale information), concurrent/duplicate worker claims
 * (exactly one execution per job), and bounded stuck-RUNNING recovery.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestContract, uniqueSuffix, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";
import { runAutomationScheduler } from "@/lib/automation/scheduler";
import { runAutomationWorker, STUCK_RUNNING_THRESHOLD_MS } from "@/lib/automation/worker";
import { rentDueReminderKey, moveInReminderKey, maintenanceSlaCheckKey } from "@/lib/automation/job-keys";
import type { RentDueReminderPayload } from "@/lib/automation/handlers/rent-due-reminder";
import type { MoveInReminderPayload } from "@/lib/automation/handlers/move-in-reminder";
import type { MaintenanceSlaCheckPayload } from "@/lib/automation/handlers/maintenance-sla-check";
import type { Prisma } from "@prisma/client";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("ASW");
});

beforeEach(() => {
  mockAuth.mockReset();
  mockAuth.mockResolvedValue(org.session);
});

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

/** Directly inserts an AutomationJob row already due (availableAt in the past) - bypasses the scheduler's own discovery window so worker-behavior tests are independent of real wall-clock date drift. */
async function insertDueJob(params: {
  jobType: "RENT_DUE_REMINDER" | "MOVE_IN_REMINDER" | "MAINTENANCE_SLA_CHECK";
  jobKey: string;
  payloadJson: object;
  scheduledFor?: Date;
  status?: "PENDING" | "RUNNING";
  lockedAt?: Date;
  lockedBy?: string;
}) {
  return prisma.automationJob.create({
    data: {
      organizationId: org.organization.id,
      jobType: params.jobType,
      jobKey: params.jobKey,
      status: params.status ?? "PENDING",
      scheduledFor: params.scheduledFor ?? new Date(Date.now() - 60_000),
      availableAt: new Date(Date.now() - 60_000),
      payloadVersion: 1,
      payloadJson: params.payloadJson as unknown as Prisma.InputJsonValue,
      lockedAt: params.lockedAt,
      lockedBy: params.lockedBy,
    },
  });
}

describe("Scheduler idempotency: duplicate runs create exactly one logical job per key", () => {
  it("running the scheduler twice for the same enabled reminder creates zero duplicate RENT_DUE_REMINDER jobs", async () => {
    await prisma.automationSettings.upsert({
      where: { organizationId: org.organization.id },
      create: { organizationId: org.organization.id, rentReminderEnabled: true },
      update: { rentReminderEnabled: true },
    });
    const { contract } = await createTestContract(org, { unitNumber: `ASW-DUP-${uniqueSuffix()}` });
    const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } });

    const now = schedule.dueDate;
    const first = await runAutomationScheduler(now);
    expect(first.rentDueReminderJobsCreated).toBeGreaterThan(0);
    const countAfterFirst = await prisma.automationJob.count({ where: { organizationId: org.organization.id, jobType: "RENT_DUE_REMINDER", jobKey: { startsWith: schedule.id } } });

    const second = await runAutomationScheduler(now);
    expect(second.rentDueReminderJobsCreated).toBe(0);
    const countAfterSecond = await prisma.automationJob.count({ where: { organizationId: org.organization.id, jobType: "RENT_DUE_REMINDER", jobKey: { startsWith: schedule.id } } });
    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it("records exactly one AutomationSchedulerRun row per invocation (Critical Principle 7 - no silent automation)", async () => {
    const before = await prisma.automationSchedulerRun.count();
    await runAutomationScheduler(new Date());
    const after = await prisma.automationSchedulerRun.count();
    expect(after).toBe(before + 1);
  });
});

describe("Execution-time eligibility recheck: a job valid when scheduled but resolved before execution skips silently", () => {
  it("RENT_DUE_REMINDER skips (not fails) once the schedule is paid off before the worker runs, and creates no outbox event", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `ASW-PAY-${uniqueSuffix()}` });
    const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } });
    const payload: RentDueReminderPayload = { scheduleId: schedule.id, offsetDays: 0, dueDate: schedule.dueDate.toISOString() };
    await insertDueJob({ jobType: "RENT_DUE_REMINDER", jobKey: rentDueReminderKey(schedule.id, 0, schedule.dueDate), payloadJson: payload });

    // The tenant pays off the schedule AFTER it was scheduled but BEFORE the worker executes it.
    await prisma.paymentSchedule.update({ where: { id: schedule.id }, data: { status: "PAID" } });

    const result = await runAutomationWorker(10);
    expect(result.skipped).toBe(1);
    expect(result.completed).toBe(0);
    expect(result.failed).toBe(0);

    const job = await prisma.automationJob.findFirstOrThrow({ where: { organizationId: org.organization.id, jobKey: rentDueReminderKey(schedule.id, 0, schedule.dueDate) }, include: { attempts: true } });
    // SKIPPED is a normal terminal outcome - the job reaches COMPLETED, never FAILED.
    expect(job.status).toBe("COMPLETED");
    expect(job.attempts).toHaveLength(1);
    expect(job.attempts[0].outcome).toBe("SKIPPED");

    const outboxCount = await prisma.communicationOutboxEvent.count({ where: { organizationId: org.organization.id, eventType: "RENT_DUE_REMINDER" } });
    expect(outboxCount).toBe(0);
  });

  it("MOVE_IN_REMINDER skips once the Move-In is rescheduled to a different instant before the worker runs", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `ASW-RESCHED-${uniqueSuffix()}` });
    const { createMoveIn, scheduleMoveIn } = await import("@/lib/actions/move-ins");
    const moveInId = await createMoveIn(fd({ contractId: contract.id }));
    const originalScheduledAt = new Date("2027-03-01T09:00:00Z");
    await scheduleMoveIn(fd({ moveInId, scheduledAt: originalScheduledAt.toISOString() }));

    // A reminder job was scheduled against the ORIGINAL instant.
    const payload: MoveInReminderPayload = { moveInId, offsetDays: 1, scheduledAt: originalScheduledAt.toISOString() };
    await insertDueJob({ jobType: "MOVE_IN_REMINDER", jobKey: moveInReminderKey(moveInId, 1, originalScheduledAt), payloadJson: payload });

    // Before the worker runs, the tenant reschedules to a new instant.
    const newScheduledAt = new Date("2027-03-10T09:00:00Z");
    await scheduleMoveIn(fd({ moveInId, scheduledAt: newScheduledAt.toISOString() }));

    const result = await runAutomationWorker(10);
    expect(result.skipped).toBe(1);

    const job = await prisma.automationJob.findFirstOrThrow({ where: { organizationId: org.organization.id, jobKey: moveInReminderKey(moveInId, 1, originalScheduledAt) }, include: { attempts: true } });
    expect(job.status).toBe("COMPLETED");
    expect(job.attempts[0].outcome).toBe("SKIPPED");

    // The reschedule itself durably recorded its OWN (new) outbox event via
    // MOVE_IN_SCHEDULED - the stale reminder job never adds a second one.
    const reminderEvents = await prisma.communicationOutboxEvent.count({ where: { organizationId: org.organization.id, eventType: "MOVE_IN_REMINDER" } });
    expect(reminderEvents).toBe(0);
  });

  it("MAINTENANCE_SLA_CHECK completes (detection-only V1 scope) without creating any outbox event", async () => {
    const requestId = await (
      await import("@/lib/actions/maintenance")
    ).createMaintenanceRequest(fd({ scopeType: "UNIT", unitId: org.unit.id, category: "GENERAL", title: "SLA check test", reportedByType: "STAFF" }));

    const payload: MaintenanceSlaCheckPayload = { requestId };
    await insertDueJob({ jobType: "MAINTENANCE_SLA_CHECK", jobKey: maintenanceSlaCheckKey(requestId, "2027-01-01"), payloadJson: payload });

    const outboxBefore = await prisma.communicationOutboxEvent.count({ where: { organizationId: org.organization.id } });
    const result = await runAutomationWorker(10);
    expect(result.completed).toBe(1);
    const outboxAfter = await prisma.communicationOutboxEvent.count({ where: { organizationId: org.organization.id } });
    expect(outboxAfter).toBe(outboxBefore);
  });
});

describe("Concurrent/duplicate worker invocations: exactly one execution per job (Critical Principle 4)", () => {
  it("two concurrent runAutomationWorker() calls racing for the same job produce exactly one attempt", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `ASW-RACE-${uniqueSuffix()}` });
    const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } });
    const payload: RentDueReminderPayload = { scheduleId: schedule.id, offsetDays: 0, dueDate: schedule.dueDate.toISOString() };
    await insertDueJob({ jobType: "RENT_DUE_REMINDER", jobKey: rentDueReminderKey(schedule.id, 0, schedule.dueDate), payloadJson: payload });

    const [a, b] = await Promise.all([runAutomationWorker(10), runAutomationWorker(10)]);
    expect(a.claimed + b.claimed).toBe(1);

    const job = await prisma.automationJob.findFirstOrThrow({ where: { organizationId: org.organization.id, jobKey: rentDueReminderKey(schedule.id, 0, schedule.dueDate) }, include: { attempts: true } });
    expect(job.status).toBe("COMPLETED");
    expect(job.attempts).toHaveLength(1);

    // Running the worker again afterward finds nothing left to claim.
    const third = await runAutomationWorker(10);
    expect(third.claimed).toBe(0);
  });
});

describe("Stuck-RUNNING recovery (Step 53): bounded, deterministic, completes exactly once", () => {
  it("a job stuck RUNNING past the threshold is recovered, reclaimed, and completes exactly once", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `ASW-STUCK-${uniqueSuffix()}` });
    const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } });
    const payload: RentDueReminderPayload = { scheduleId: schedule.id, offsetDays: 0, dueDate: schedule.dueDate.toISOString() };
    const staleLockedAt = new Date(Date.now() - STUCK_RUNNING_THRESHOLD_MS - 60_000);
    await insertDueJob({
      jobType: "RENT_DUE_REMINDER",
      jobKey: rentDueReminderKey(schedule.id, 0, schedule.dueDate),
      payloadJson: payload,
      status: "RUNNING",
      lockedAt: staleLockedAt,
      lockedBy: "ghost-worker-crashed",
    });

    const result = await runAutomationWorker(10);
    expect(result.recovered).toBe(1);
    expect(result.completed).toBe(1);

    const job = await prisma.automationJob.findFirstOrThrow({ where: { organizationId: org.organization.id, jobKey: rentDueReminderKey(schedule.id, 0, schedule.dueDate) }, include: { attempts: true } });
    expect(job.status).toBe("COMPLETED");
    // Exactly one attempt row - the crashed run never recorded one of its own.
    expect(job.attempts).toHaveLength(1);
  });

  it("a job still legitimately within the RUNNING threshold is never recovered out from under itself", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `ASW-LIVE-${uniqueSuffix()}` });
    const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } });
    const payload: RentDueReminderPayload = { scheduleId: schedule.id, offsetDays: 0, dueDate: schedule.dueDate.toISOString() };
    const recentLockedAt = new Date(Date.now() - 5_000);
    const job = await insertDueJob({
      jobType: "RENT_DUE_REMINDER",
      jobKey: rentDueReminderKey(schedule.id, 0, schedule.dueDate),
      payloadJson: payload,
      status: "RUNNING",
      lockedAt: recentLockedAt,
      lockedBy: "a-worker-still-actually-running",
    });

    const result = await runAutomationWorker(10);
    expect(result.recovered).toBe(0);
    expect(result.claimed).toBe(0);

    const stillRunning = await prisma.automationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stillRunning.status).toBe("RUNNING");
    expect(stillRunning.lockedBy).toBe("a-worker-still-actually-running");
  });
});
