import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { createCommunicationMessagesForEvent } from "@/lib/communications/enqueue";
import { computeNextAttemptAt, STUCK_PROCESSING_THRESHOLD_MS } from "@/lib/communications/retry";
import { OUTBOX_PAYLOAD_VERSION, type OutboxPayloadV1 } from "./outbox-emit";

const DEFAULT_BATCH_SIZE = 20;
const MAX_BATCH_SIZE = 100;

export interface ProcessOutboxResult {
  recovered: number;
  claimed: number;
  processed: number;
  failed: number;
}

/**
 * Step 8/9 - the outbox processor. Turns a durable CommunicationOutboxEvent
 * into CommunicationMessage row(s) by delegating to the exact same
 * rule-resolution/template-render/idempotent-create logic every other path
 * to CommunicationMessage already uses (`createCommunicationMessagesForEvent()`,
 * src/lib/communications/enqueue.ts) - never a second, competing
 * implementation of "resolve rules -> render template -> create message."
 *
 * Never calls a provider or touches the network (Step 9) - that remains the
 * separate communication delivery worker's job
 * (`processQueuedCommunications()`, src/lib/communications/processor.ts),
 * unchanged by this module. This function's entire job is: outbox event in,
 * CommunicationMessage row(s) out.
 *
 * Concurrency-safe by the identical atomic-claim idiom that worker already
 * established: a single conditional `updateMany({ where: { status: "PENDING" } })`
 * per candidate row - only one concurrent processor run can ever affect a
 * given row (Critical Principle 4).
 */
export async function processCommunicationOutbox(batchSize: number = DEFAULT_BATCH_SIZE): Promise<ProcessOutboxResult> {
  const effectiveBatchSize = Math.max(1, Math.min(batchSize, MAX_BATCH_SIZE));
  const workerId = `outbox-worker-${randomUUID()}`;

  const recovered = await recoverStuckOutboxEvents();

  const now = new Date();
  const candidates = await prisma.communicationOutboxEvent.findMany({
    where: { status: "PENDING", availableAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: effectiveBatchSize,
    select: { id: true, organizationId: true },
  });

  let claimed = 0;
  let processed = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const claim = await prisma.communicationOutboxEvent.updateMany({
      where: { id: candidate.id, organizationId: candidate.organizationId, status: "PENDING" },
      data: { status: "PROCESSING", lockedAt: new Date(), lockedBy: workerId },
    });
    if (claim.count !== 1) continue; // Another concurrent processor claimed it first.
    claimed++;

    const outcome = await processClaimedEvent(candidate.id);
    if (outcome === "PROCESSED") processed++;
    else failed++;
  }

  return { recovered, claimed, processed, failed };
}

/**
 * Step 11 - a row stuck PROCESSING past the same threshold the
 * Communications delivery worker already uses means the processor that
 * claimed it crashed before recording an outcome, never that it is still
 * legitimately in flight (this function never makes a network call, so it
 * cannot legitimately run anywhere near this long). Recovering it back to
 * PENDING is deterministic and bounded - it does not increment
 * `attemptCount` (no attempt was actually recorded for the crashed run).
 */
async function recoverStuckOutboxEvents(): Promise<number> {
  const threshold = new Date(Date.now() - STUCK_PROCESSING_THRESHOLD_MS);
  const result = await prisma.communicationOutboxEvent.updateMany({
    where: { status: "PROCESSING", lockedAt: { lt: threshold } },
    data: { status: "PENDING", lockedAt: null, lockedBy: null },
  });
  return result.count;
}

export function isSupportedPayload(payloadVersion: number, payload: unknown): payload is OutboxPayloadV1 {
  if (payloadVersion !== OUTBOX_PAYLOAD_VERSION) return false;
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.businessEntityType === "string" &&
    typeof p.businessEntityId === "string" &&
    typeof p.language === "string" &&
    typeof p.variables === "object" &&
    Array.isArray(p.recipients)
  );
}

async function processClaimedEvent(eventId: string): Promise<"PROCESSED" | "FAILED"> {
  const event = await prisma.communicationOutboxEvent.findUniqueOrThrow({ where: { id: eventId } });
  const attemptNumber = event.attemptCount + 1;

  // Step 14 - an unknown/incompatible payload version fails safely and
  // permanently: no handler here can guess what an unrecognized shape
  // means, and retrying it would never succeed.
  if (!isSupportedPayload(event.payloadVersion, event.payloadJson)) {
    await prisma.communicationOutboxEvent.update({
      where: { id: event.id },
      data: {
        status: "FAILED",
        attemptCount: attemptNumber,
        failedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: "UNSUPPORTED_PAYLOAD_VERSION",
        lastErrorMessage: `payloadVersion ${event.payloadVersion} is not supported by this processor`,
      },
    });
    return "FAILED";
  }

  const payload = event.payloadJson as unknown as OutboxPayloadV1;

  try {
    await createCommunicationMessagesForEvent({
      organizationId: event.organizationId,
      eventType: event.eventType,
      businessEntityType: payload.businessEntityType,
      businessEntityId: payload.businessEntityId,
      language: payload.language,
      variables: payload.variables,
      recipients: payload.recipients,
    });
    await prisma.communicationOutboxEvent.update({
      where: { id: event.id },
      data: { status: "PROCESSED", attemptCount: attemptNumber, processedAt: new Date(), lockedAt: null, lockedBy: null, lastErrorCode: null, lastErrorMessage: null },
    });
    return "PROCESSED";
  } catch (error) {
    // Step 12 - every failure here is a DB/logic error resolving rules or
    // creating messages (never a provider error - this function never
    // calls a provider), so all failures are retryable up to maxAttempts;
    // there is no separate "permanent business validation failure" class
    // for this step the way there is for a scheduled job handler.
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isPermanent = attemptNumber >= event.maxAttempts;
    await prisma.communicationOutboxEvent.update({
      where: { id: event.id },
      data: isPermanent
        ? { status: "FAILED", attemptCount: attemptNumber, failedAt: new Date(), lockedAt: null, lockedBy: null, lastErrorCode: "PROCESSING_ERROR", lastErrorMessage: errorMessage }
        : {
            status: "PENDING",
            attemptCount: attemptNumber,
            availableAt: computeNextAttemptAt(attemptNumber),
            lockedAt: null,
            lockedBy: null,
            lastErrorCode: "PROCESSING_ERROR",
            lastErrorMessage: errorMessage,
          },
    });
    return "FAILED";
  }
}
