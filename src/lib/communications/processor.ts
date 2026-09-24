import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getProviderForChannel } from "./providers/factory";
import { classifyProviderError, computeNextAttemptAt, hasExceededMaxAttempts, STUCK_PROCESSING_THRESHOLD_MS } from "./retry";

const DEFAULT_BATCH_SIZE = 20;
const MAX_BATCH_SIZE = 100;

export interface ProcessQueuedCommunicationsResult {
  recovered: number;
  claimed: number;
  sent: number;
  failed: number;
}

/**
 * The queue processor. Called only from the protected internal worker route
 * (src/app/api/communications/process/route.ts) - never from a user-facing
 * server action, and never awaited by a business transaction (Critical
 * Principle 3).
 *
 * Concurrency safety (the mandatory "two workers race for one message ->
 * exactly one send" guarantee): claiming is a single conditional
 * `updateMany({ where: { id, status: "QUEUED" } })` per candidate row.
 * Postgres evaluates that WHERE clause atomically against the row's
 * current state, so if two processor runs read the same QUEUED row in
 * their initial `findMany`, only one of their subsequent claim attempts
 * can affect a row (count === 1); the other's `updateMany` matches zero
 * rows (count === 0) because the status column no longer reads "QUEUED" by
 * the time it runs, and that run skips straight past it. No raw
 * `SELECT ... FOR UPDATE SKIP LOCKED` is needed for this to be correct.
 */
export async function processQueuedCommunications(batchSize: number = DEFAULT_BATCH_SIZE): Promise<ProcessQueuedCommunicationsResult> {
  const effectiveBatchSize = Math.max(1, Math.min(batchSize, MAX_BATCH_SIZE));
  const workerId = `worker-${randomUUID()}`;

  const recovered = await recoverStuckProcessingMessages();

  const now = new Date();
  const candidates = await prisma.communicationMessage.findMany({
    where: {
      status: "QUEUED",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: { createdAt: "asc" },
    take: effectiveBatchSize,
    select: { id: true, organizationId: true },
  });

  let claimed = 0;
  let sent = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const claim = await prisma.communicationMessage.updateMany({
      where: { id: candidate.id, organizationId: candidate.organizationId, status: "QUEUED" },
      data: { status: "PROCESSING", claimedAt: new Date(), claimedBy: workerId },
    });
    if (claim.count !== 1) continue; // Another concurrent worker claimed it first.
    claimed++;

    const outcome = await sendClaimedMessage(candidate.id);
    if (outcome === "SENT") sent++;
    else failed++;
  }

  return { recovered, claimed, sent, failed };
}

/**
 * A row stuck in PROCESSING past the threshold means the worker that
 * claimed it crashed (or was killed) before recording SENT/FAILED - never
 * that it is still legitimately in flight (a mock/real provider call is
 * expected to resolve in well under this threshold). Recovering it back to
 * QUEUED lets the next processor run retry it; this does not double-count
 * as an "attempt" since no CommunicationDeliveryAttempt was ever recorded
 * for the crashed run.
 */
async function recoverStuckProcessingMessages(): Promise<number> {
  const threshold = new Date(Date.now() - STUCK_PROCESSING_THRESHOLD_MS);
  const result = await prisma.communicationMessage.updateMany({
    where: { status: "PROCESSING", claimedAt: { lt: threshold } },
    data: { status: "QUEUED", claimedAt: null, claimedBy: null },
  });
  return result.count;
}

async function sendClaimedMessage(messageId: string): Promise<"SENT" | "FAILED"> {
  const message = await prisma.communicationMessage.findUniqueOrThrow({ where: { id: messageId } });
  const provider = getProviderForChannel(message.channel);
  const attemptNumber = message.attemptCount + 1;
  const startedAt = new Date();

  const result = await provider.send({
    destination: message.destinationRaw,
    subject: message.renderedSubject ?? undefined,
    body: message.renderedBody,
    language: message.language === "ar" ? "ar" : "en",
  });
  const finishedAt = new Date();

  await prisma.communicationDeliveryAttempt.create({
    data: {
      organizationId: message.organizationId,
      messageId: message.id,
      attemptNumber,
      status: result.success ? "SENT" : "FAILED",
      providerName: provider.name,
      providerMessageId: result.providerMessageId,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      startedAt,
      finishedAt,
    },
  });

  if (result.success) {
    await prisma.communicationMessage.update({
      where: { id: message.id },
      data: {
        status: "SENT",
        attemptCount: attemptNumber,
        lastAttemptAt: finishedAt,
        sentAt: finishedAt,
        claimedAt: null,
        claimedBy: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    return "SENT";
  }

  const errorCode = result.errorCode ?? "UNKNOWN";
  const isPermanent = classifyProviderError(errorCode) === "PERMANENT" || hasExceededMaxAttempts(attemptNumber, message.maxAttempts);

  await prisma.communicationMessage.update({
    where: { id: message.id },
    data: isPermanent
      ? {
          status: "FAILED",
          attemptCount: attemptNumber,
          lastAttemptAt: finishedAt,
          failedAt: finishedAt,
          claimedAt: null,
          claimedBy: null,
          lastErrorCode: errorCode,
          lastErrorMessage: result.errorMessage,
        }
      : {
          status: "QUEUED",
          attemptCount: attemptNumber,
          lastAttemptAt: finishedAt,
          nextAttemptAt: computeNextAttemptAt(attemptNumber, finishedAt),
          claimedAt: null,
          claimedBy: null,
          lastErrorCode: errorCode,
          lastErrorMessage: result.errorMessage,
        },
  });
  return "FAILED";
}
