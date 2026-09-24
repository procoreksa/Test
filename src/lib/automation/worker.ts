import { randomUUID } from "crypto";
import type { AutomationJobAttemptOutcome } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeNextAttemptAt } from "@/lib/communications/retry";
import { AUTOMATION_HANDLERS } from "./handlers";
import type { AutomationHandlerOutcome } from "./handler-types";

const DEFAULT_BATCH_SIZE = 20;
const MAX_BATCH_SIZE = 100;

/**
 * Jobs run real domain logic (DB reads/writes, not just a provider call
 * like the Communications delivery worker), so this threshold is more
 * generous than that worker's 5-minute one - still short enough that a
 * genuinely stuck (crashed) job recovers within one operator work session,
 * long enough that no legitimate handler run is ever recycled out from
 * under itself.
 */
const STUCK_RUNNING_THRESHOLD_MS = 10 * 60_000;

export { STUCK_RUNNING_THRESHOLD_MS };

export interface RunAutomationWorkerResult {
  recovered: number;
  claimed: number;
  completed: number;
  skipped: number;
  failed: number;
}

/**
 * Step 48/57 - the AutomationJob worker. Claims due, PENDING jobs (atomic
 * conditional `updateMany`, the same idiom every other worker in this
 * codebase already uses - Critical Principle 4) and executes each one
 * through the central handler registry (Step 54) - never a dynamic
 * eval/import from DB-stored data.
 */
export async function runAutomationWorker(batchSize: number = DEFAULT_BATCH_SIZE): Promise<RunAutomationWorkerResult> {
  const effectiveBatchSize = Math.max(1, Math.min(batchSize, MAX_BATCH_SIZE));
  const workerId = `automation-worker-${randomUUID()}`;

  const recovered = await recoverStuckRunningJobs();

  const now = new Date();
  const candidates = await prisma.automationJob.findMany({
    where: { status: "PENDING", availableAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: effectiveBatchSize,
    select: { id: true, organizationId: true },
  });

  let claimed = 0;
  let completed = 0;
  let skipped = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const claim = await prisma.automationJob.updateMany({
      where: { id: candidate.id, organizationId: candidate.organizationId, status: "PENDING" },
      data: { status: "RUNNING", lockedAt: new Date(), lockedBy: workerId, startedAt: new Date() },
    });
    if (claim.count !== 1) continue; // Another concurrent worker claimed it first.
    claimed++;

    const outcome = await executeClaimedJob(candidate.id, workerId);
    if (outcome === "COMPLETED") completed++;
    else if (outcome === "SKIPPED") skipped++;
    else failed++;
  }

  return { recovered, claimed, completed, skipped, failed };
}

/** Step 53 - bounded, deterministic stuck-RUNNING recovery, never touching a job still legitimately inside its threshold window. */
async function recoverStuckRunningJobs(): Promise<number> {
  const threshold = new Date(Date.now() - STUCK_RUNNING_THRESHOLD_MS);
  const result = await prisma.automationJob.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: threshold } },
    data: { status: "PENDING", lockedAt: null, lockedBy: null },
  });
  return result.count;
}

async function executeClaimedJob(jobId: string, workerId: string): Promise<"COMPLETED" | "SKIPPED" | "FAILED"> {
  const job = await prisma.automationJob.findUniqueOrThrow({ where: { id: jobId } });
  const attemptNumber = job.attemptCount + 1;
  const startedAt = new Date();

  const handler = AUTOMATION_HANDLERS[job.jobType];
  if (!handler) {
    // Step 32/54 - an unknown job type (a future rollback, a payload from a
    // newer deploy) fails safely and permanently; no dynamic lookup is ever
    // attempted.
    return recordOutcome(job, attemptNumber, workerId, startedAt, {
      kind: "PERMANENT_FAILURE",
      errorCode: "UNKNOWN_JOB_TYPE",
      errorMessage: `No handler registered for job type ${job.jobType}`,
    });
  }

  let outcome: AutomationHandlerOutcome;
  try {
    outcome = await handler({
      organizationId: job.organizationId,
      jobId: job.id,
      jobKey: job.jobKey,
      scheduledFor: job.scheduledFor,
      payloadVersion: job.payloadVersion,
      payloadJson: job.payloadJson,
    });
  } catch (error) {
    // Step 56 - an unexpected exception (not a handler-recognized business
    // condition) is always treated as retryable, never permanent - the
    // handler itself is the one place that can say "this is permanently
    // invalid."
    outcome = { kind: "RETRYABLE_FAILURE", errorCode: "HANDLER_THREW", errorMessage: error instanceof Error ? error.message : String(error) };
  }

  return recordOutcome(job, attemptNumber, workerId, startedAt, outcome);
}

function outcomeToAttemptRecord(outcome: AutomationHandlerOutcome): AutomationJobAttemptOutcome {
  return outcome.kind;
}

async function recordOutcome(
  job: { id: string; maxAttempts: number },
  attemptNumber: number,
  workerId: string,
  startedAt: Date,
  outcome: AutomationHandlerOutcome
): Promise<"COMPLETED" | "SKIPPED" | "FAILED"> {
  const finishedAt = new Date();

  // Step 46 - append-only history, written once per attempt, never mutated.
  await prisma.automationJobAttempt.create({
    data: {
      jobId: job.id,
      attemptNumber,
      workerId,
      startedAt,
      finishedAt,
      outcome: outcomeToAttemptRecord(outcome),
      errorCode: "errorCode" in outcome ? outcome.errorCode : null,
      errorMessage: "errorMessage" in outcome ? outcome.errorMessage : null,
    },
  });

  switch (outcome.kind) {
    case "COMPLETED":
      await prisma.automationJob.update({
        where: { id: job.id },
        data: { status: "COMPLETED", attemptCount: attemptNumber, completedAt: finishedAt, lockedAt: null, lockedBy: null, lastErrorCode: null, lastErrorMessage: null },
      });
      return "COMPLETED";

    case "SKIPPED":
      // Step 52 - a genuinely valid-when-scheduled job that is no longer
      // eligible at execution time (already paid, already renewed, already
      // rescheduled away) is a normal terminal outcome, not a failure - the
      // job reaches COMPLETED; the *reason* lives on the AutomationJobAttempt
      // row (`outcome: SKIPPED`), not as a fabricated "error."
      await prisma.automationJob.update({
        where: { id: job.id },
        data: { status: "COMPLETED", attemptCount: attemptNumber, completedAt: finishedAt, lockedAt: null, lockedBy: null, lastErrorCode: null, lastErrorMessage: null },
      });
      return "SKIPPED";

    case "RETRYABLE_FAILURE": {
      const exceeded = attemptNumber >= job.maxAttempts;
      await prisma.automationJob.update({
        where: { id: job.id },
        data: exceeded
          ? { status: "FAILED", attemptCount: attemptNumber, failedAt: finishedAt, lockedAt: null, lockedBy: null, lastErrorCode: outcome.errorCode, lastErrorMessage: outcome.errorMessage }
          : {
              status: "PENDING",
              attemptCount: attemptNumber,
              availableAt: computeNextAttemptAt(attemptNumber),
              lockedAt: null,
              lockedBy: null,
              lastErrorCode: outcome.errorCode,
              lastErrorMessage: outcome.errorMessage,
            },
      });
      return "FAILED";
    }

    case "PERMANENT_FAILURE":
      await prisma.automationJob.update({
        where: { id: job.id },
        data: { status: "FAILED", attemptCount: attemptNumber, failedAt: finishedAt, lockedAt: null, lockedBy: null, lastErrorCode: outcome.errorCode, lastErrorMessage: outcome.errorMessage },
      });
      return "FAILED";
  }
}
