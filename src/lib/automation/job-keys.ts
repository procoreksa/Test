/**
 * AutomationJob logical-key construction, reviewed per job type (Step 19) -
 * the business date/version is part of the key wherever the underlying
 * business fact can legitimately change (a rescheduled Move-In/Move-Out, a
 * due date pushed by a renegotiated schedule), so a genuine change produces
 * a new logical job instead of colliding with - and silently discarding -
 * the stale one.
 */

/** Rent-due reminder: one logical job per (schedule, offset, due date) - if the due date changes, the old reminder job for the old date is a different logical job (naturally orphaned, never executed against stale data since the scheduler only creates jobs for the CURRENT due date going forward). */
export function rentDueReminderKey(scheduleId: string, offsetDays: number, dueDate: Date): string {
  return `${scheduleId}:${offsetDays}:${dueDate.toISOString().slice(0, 10)}`;
}

/** Contract-expiry reminder: one logical job per (contract, offset, end date). */
export function contractExpiryReminderKey(contractId: string, offsetDays: number, endDate: Date): string {
  return `${contractId}:${offsetDays}:${endDate.toISOString().slice(0, 10)}`;
}

/** Move-In reminder: includes the scheduled instant - a reschedule is a new logical reminder. */
export function moveInReminderKey(moveInId: string, offsetDays: number, scheduledAt: Date): string {
  return `${moveInId}:${offsetDays}:${scheduledAt.toISOString()}`;
}

/** Move-Out reminder: same reasoning as Move-In. */
export function moveOutReminderKey(moveOutId: string, offsetDays: number, scheduledAt: Date): string {
  return `${moveOutId}:${offsetDays}:${scheduledAt.toISOString()}`;
}

/** Maintenance SLA check: one alert per (request, calendar day) - Step 35's dedupe cadence, so a request overdue across 10 scheduler runs in the same day produces exactly one job, not ten. `dateKey` is a "yyyy-MM-dd" string in the organization's own timezone (src/lib/automation/timezone.ts). */
export function maintenanceSlaCheckKey(requestId: string, dateKey: string): string {
  return `${requestId}:${dateKey}`;
}
