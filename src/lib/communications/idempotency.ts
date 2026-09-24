/**
 * DB-enforced idempotency key construction (Critical Principle 5). Deriving
 * the key purely from the business identifiers of the event - never a
 * timestamp or random value - means the same business event, resolved to
 * the same channel and recipient, always produces the same key: a retried
 * enqueue attempt (e.g. a double-submitted form, a future at-least-once
 * event replay) collides on `@@unique([organizationId, idempotencyKey])`
 * instead of creating a duplicate CommunicationMessage.
 */
export function buildIdempotencyKey(params: {
  eventType: string;
  businessEntityType: string;
  businessEntityId: string;
  channel: string;
  recipientType: string;
  recipientId: string;
}): string {
  return [
    params.eventType,
    params.businessEntityType,
    params.businessEntityId,
    params.channel,
    params.recipientType,
    params.recipientId,
  ].join(":");
}
