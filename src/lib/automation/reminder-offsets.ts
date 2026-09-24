/**
 * V1 reminder-offset defaults (Step 25/30/32/33) - centralized here, never
 * invented ad hoc inside a handler or the scheduler. These are a small,
 * documented, easy-to-change V1 default, not a claim of product-owner-
 * approved business policy - see docs/AUTOMATION-SCHEDULED-JOBS.md
 * "Rent-due reminders"/"Contract-expiry reminders". Every tenant-facing
 * reminder type these drive is disabled by default per organization
 * (AutomationSettings, all flags default false - Step 38) until explicitly
 * turned on.
 */

/** Days relative to a PaymentSchedule's dueDate: negative = before due, 0 = on due date, positive = days overdue. */
export const RENT_DUE_REMINDER_OFFSETS_DAYS: readonly number[] = [-7, -3, 0, 3];

/** Days before a Contract's endDate. */
export const CONTRACT_EXPIRY_REMINDER_OFFSETS_DAYS: readonly number[] = [90, 60, 30, 7];

/** Days before a Move-In's scheduledAt. */
export const MOVE_IN_REMINDER_OFFSET_DAYS = 1;

/** Days before a Move-Out's scheduledAt. */
export const MOVE_OUT_REMINDER_OFFSET_DAYS = 1;

/** Bounded scheduler lookahead (Step 21) - the scheduler never materializes jobs further into the future than this. */
export const SCHEDULER_LOOKAHEAD_DAYS = 45;
