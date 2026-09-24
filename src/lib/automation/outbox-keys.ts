/**
 * Outbox event-key construction, reviewed per event type (Step 5) - never a
 * blind "use the business record's own id" default. A key must uniquely
 * identify one logical OCCURRENCE of the event: for an event that can only
 * ever happen once per record (an invoice is issued once, a payment row is
 * created once), the record's own id is enough. For an event whose business
 * record can legitimately re-emit the same event type more than once (a
 * Maintenance Work Order can be rescheduled; a Move-In/Move-Out can be
 * rescheduled), the key must include the value that changes, so a genuine
 * reschedule produces a new logical event instead of colliding with - and
 * silently discarding - the stale one.
 */

export function invoiceIssuedKey(invoiceId: string): string {
  return invoiceId;
}

export function paymentReceivedKey(paymentId: string): string {
  return paymentId;
}

export function maintenanceRequestCreatedKey(requestId: string): string {
  return requestId;
}

/** Includes the scheduled instant: a reschedule to a new time is a new logical "you've been scheduled" notification, not a duplicate of the old one. */
export function maintenanceScheduledKey(workOrderId: string, scheduledStart: Date): string {
  return `${workOrderId}:${scheduledStart.toISOString()}`;
}

export function maintenanceCompletedKey(workOrderId: string): string {
  return workOrderId;
}

export function moveInScheduledKey(moveInId: string, scheduledAt: Date): string {
  return `${moveInId}:${scheduledAt.toISOString()}`;
}

export function moveOutScheduledKey(moveOutId: string, scheduledAt: Date): string {
  return `${moveOutId}:${scheduledAt.toISOString()}`;
}

export function securityDepositSettlementPostedKey(settlementId: string): string {
  return settlementId;
}

export function securityDepositRefundRecordedKey(refundId: string): string {
  return refundId;
}
