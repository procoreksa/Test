import type { CommunicationMessageStatus } from "@prisma/client";

/**
 * The enforced CommunicationMessage state machine (Critical Principle 4:
 * delivery status is authoritative - a message is never marked SENT merely
 * because it was queued). Every status-changing write in this module
 * checks isValidStatusTransition() before persisting, so an invalid jump
 * (e.g. QUEUED -> DELIVERED) is a bug caught at the call site, not a data
 * inconsistency discovered later.
 *
 * QUEUED -> PROCESSING: claimed by the queue processor (a conditional
 *   updateMany, see enqueue/processor.ts).
 * PROCESSING -> QUEUED: stuck-processing recovery (the claiming worker
 *   crashed before recording SENT/FAILED - the next processor run reclaims
 *   it after the threshold in retry.ts).
 * PROCESSING -> SENT | FAILED: the provider call resolved.
 * SENT -> DELIVERED -> READ: webhook-reported progress only (never
 *   fabricated - see docs/NOTIFICATIONS-COMMUNICATIONS.md, "Webhook
 *   foundation").
 * FAILED -> QUEUED: a manual retry (communications.retry), attemptCount is
 *   NOT reset - the existing max-attempts check applies unchanged.
 * QUEUED -> CANCELLED: communications.cancel. Once PROCESSING, a message
 *   can no longer be cancelled (the claim already committed the processor
 *   to attempting a send).
 */
const VALID_TRANSITIONS: Record<CommunicationMessageStatus, readonly CommunicationMessageStatus[]> = {
  QUEUED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SENT", "FAILED", "QUEUED"],
  SENT: ["DELIVERED"],
  DELIVERED: ["READ"],
  READ: [],
  FAILED: ["QUEUED"],
  CANCELLED: [],
};

export function isValidStatusTransition(from: CommunicationMessageStatus, to: CommunicationMessageStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertValidStatusTransition(from: CommunicationMessageStatus, to: CommunicationMessageStatus): void {
  if (!isValidStatusTransition(from, to)) {
    throw new Error(`Invalid CommunicationMessage status transition: ${from} -> ${to}`);
  }
}
