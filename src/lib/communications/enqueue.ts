import { prisma } from "@/lib/prisma";
import type { CommunicationEventType, CommunicationRecipientType, Prisma } from "@prisma/client";
import { getEventDefinition } from "./events";
import { renderTemplate } from "./render";
import { buildIdempotencyKey } from "./idempotency";
import { maskDestination } from "./masking";
import { toE164 } from "./phone";
import { findCandidateForStrategy, type CandidateRecipient } from "./recipients";
import type { NotificationLanguage } from "./language";

export interface EnqueueCommunicationEventInput {
  organizationId: string;
  eventType: CommunicationEventType;
  /** Traceability only (e.g. "Invoice" / the Invoice's own id) - never used for authorization. */
  businessEntityType: string;
  businessEntityId: string;
  language: NotificationLanguage;
  /** Values for the event's allow-listed `{{variableName}}` placeholders (see events.ts), pre-formatted as display strings. */
  variables: Record<string, string>;
  /** Every recipient candidate the caller can resolve for this occurrence - see recipients.ts. Only strategies with an enabled Rule and a matching candidate ever produce a message. */
  recipients: CandidateRecipient[];
}

/**
 * The ONLY entry point business modules use to trigger a notification -
 * never a direct provider/vendor call (see the module header comment in
 * schema.prisma). Callers invoke this strictly AFTER their own
 * `prisma.$transaction(...)` has already resolved, in the same post-commit
 * gap where `revalidatePath()` calls already run (Critical Principle 3).
 *
 * Deliberately swallows every error: a notification failure - a missing
 * template, a DB hiccup, a bug in this module - must never surface to the
 * caller or affect a business action that has already committed.
 */
export async function enqueueCommunicationEvent(input: EnqueueCommunicationEventInput): Promise<void> {
  try {
    await createCommunicationMessagesForEvent(input);
  } catch (error) {
    console.error("[communications] enqueue failed", {
      eventType: input.eventType,
      businessEntityType: input.businessEntityType,
      businessEntityId: input.businessEntityId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * The actual rule-resolution -> template-render -> idempotent-CommunicationMessage-creation
 * logic, factored out so both the legacy fire-and-forget wrapper above AND
 * the durable outbox processor (src/lib/automation/outbox-processor.ts,
 * Step 8) share exactly one implementation - never two competing ways to
 * turn a resolved business event into CommunicationMessage rows. Unlike the
 * wrapper above, this throws on a genuine failure (a DB error resolving
 * rules/templates) - the outbox processor needs that to distinguish a
 * retryable failure from success (Critical Principle 3), and the legacy
 * wrapper already catches everything at its own call site.
 */
export async function createCommunicationMessagesForEvent(input: EnqueueCommunicationEventInput): Promise<void> {
  const definition = getEventDefinition(input.eventType);
  if (!definition.wired) return; // Defining an event in the registry never auto-enables it.

  const rules = await prisma.communicationRule.findMany({
    where: { organizationId: input.organizationId, eventType: input.eventType, isEnabled: true },
  });

  for (const rule of rules) {
    const candidate = findCandidateForStrategy(input.recipients, rule.recipientStrategy, rule.specificUserId);
    if (!candidate) continue;

    const destinationRaw = rule.channel === "EMAIL" ? candidate.email : candidate.phone ? toE164(candidate.phone) : null;
    if (!destinationRaw) continue; // No email/phone on file for this recipient+channel - nothing to send.

    const template = await prisma.communicationTemplate.findFirst({
      where: {
        organizationId: input.organizationId,
        eventType: input.eventType,
        channel: rule.channel,
        language: input.language,
        status: "ACTIVE",
      },
    });
    if (!template) continue; // A Rule enabled with no ACTIVE template for this language simply produces nothing yet.

    const idempotencyKey = buildIdempotencyKey({
      eventType: input.eventType,
      businessEntityType: input.businessEntityType,
      businessEntityId: input.businessEntityId,
      channel: rule.channel,
      recipientType: candidate.recipientType,
      recipientId: candidate.recipientId,
    });

    const rendered = renderTemplate({
      subject: template.subject,
      bodyText: template.bodyText,
      bodyHtml: template.bodyHtml,
      variables: input.variables,
      allowedVariables: template.variables,
    });

    const baseData = {
      organizationId: input.organizationId,
      eventType: input.eventType,
      channel: rule.channel,
      language: input.language,
      status: "QUEUED" as const,
      recipientType: candidate.recipientType,
      destinationRaw,
      destinationMasked: maskDestination(destinationRaw, rule.channel),
      templateId: template.id,
      templateVersion: template.version,
      renderedSubject: rendered.subject,
      renderedBody: rendered.bodyHtml ?? rendered.bodyText,
      variablesSnapshot: input.variables as Prisma.InputJsonValue,
      businessEntityType: input.businessEntityType,
      businessEntityId: input.businessEntityId,
      idempotencyKey,
    };

    try {
      await prisma.communicationMessage.create({
        data: { ...baseData, ...recipientRelationData(candidate.recipientType, candidate.recipientId) },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        // Already enqueued for this exact (event, business record, channel,
        // recipient) - Critical Principle 5: idempotent, not an error.
        continue;
      }
      throw error;
    }
  }
}

function recipientRelationData(recipientType: CommunicationRecipientType, recipientId: string) {
  switch (recipientType) {
    case "RENTER":
      return { renterId: recipientId };
    case "OWNER":
      return { ownerId: recipientId };
    case "CORPORATE_CONTACT":
      return { corporateContactId: recipientId };
    case "CORPORATE_OCCUPANT":
      return { corporateOccupantId: recipientId };
    case "INTERNAL_USER":
      return { internalUserId: recipientId };
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}
