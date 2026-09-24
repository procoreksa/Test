import type { Prisma, PrismaClient, CommunicationEventType } from "@prisma/client";
import { getEventDefinition } from "@/lib/communications/events";
import type { CandidateRecipient } from "@/lib/communications/recipients";
import type { NotificationLanguage } from "@/lib/communications/language";

type Tx = Prisma.TransactionClient | PrismaClient;

/** Bumped only if the shape below ever changes incompatibly - see outbox-processor.ts's version guard (Step 14). */
export const OUTBOX_PAYLOAD_VERSION = 1;

export interface OutboxPayloadV1 {
  businessEntityType: string;
  businessEntityId: string;
  language: NotificationLanguage;
  variables: Record<string, string>;
  recipients: CandidateRecipient[];
}

export interface EmitCommunicationEventTxInput {
  organizationId: string;
  eventType: CommunicationEventType;
  /** See outbox-keys.ts - built per event type, never a blind id reuse. */
  eventKey: string;
  businessEntityType: string;
  businessEntityId: string;
  language: NotificationLanguage;
  variables: Record<string, string>;
  recipients: CandidateRecipient[];
}

/**
 * Critical Principle 1 - the durable-intent-before-async-work boundary.
 * Inserts one CommunicationOutboxEvent row using the SAME transaction client
 * the caller's business mutation already used, so the outbox intent and the
 * business mutation share one atomicity boundary: if the transaction rolls
 * back, the intent never existed; if it commits, the intent is durably on
 * disk before this function - and the caller's whole transaction - returns.
 *
 * Deliberately the opposite of enqueueCommunicationEvent()'s
 * swallow-every-error posture (src/lib/communications/enqueue.ts): a
 * genuine insert failure here is NOT idempotency (that's handled below) and
 * must propagate, so the business transaction itself fails rather than
 * silently losing a required follow-up intent (Step 6: "Business
 * transaction should fail if a REQUIRED outbox intent cannot be durably
 * inserted").
 *
 * Never calls a provider, never touches the network, never processes the
 * queue - purely a DB write (Step 6).
 */
export async function emitCommunicationEventTx(tx: Tx, input: EmitCommunicationEventTxInput): Promise<void> {
  const definition = getEventDefinition(input.eventType);
  if (!definition.wired) return; // Defining an event in the registry never auto-enables it - same rule as enqueueCommunicationEvent().

  const payload: OutboxPayloadV1 = {
    businessEntityType: input.businessEntityType,
    businessEntityId: input.businessEntityId,
    language: input.language,
    variables: input.variables,
    recipients: input.recipients,
  };

  try {
    await tx.communicationOutboxEvent.create({
      data: {
        organizationId: input.organizationId,
        eventType: input.eventType,
        eventKey: input.eventKey,
        payloadVersion: OUTBOX_PAYLOAD_VERSION,
        payloadJson: payload as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) return; // Already durably recorded for this exact logical occurrence - idempotent, not an error (Step 5).
    throw error;
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}
