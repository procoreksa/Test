import { prisma } from "@/lib/prisma";
import { buildRenterRecipient } from "@/lib/communications/recipients";
import { emitCommunicationEventTx } from "../outbox-emit";
import { rentDueReminderKey } from "../job-keys";
import type { AutomationHandler } from "../handler-types";

export interface RentDueReminderPayload {
  scheduleId: string;
  offsetDays: number;
  /** Snapshotted at schedule time - the ISO string of PaymentSchedule.dueDate when this job was created (Step 76's recheck target). */
  dueDate: string;
}

export function isRentDueReminderPayload(payload: unknown): payload is RentDueReminderPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as Record<string, unknown>).scheduleId === "string" &&
    typeof (payload as Record<string, unknown>).offsetDays === "number" &&
    typeof (payload as Record<string, unknown>).dueDate === "string"
  );
}

/**
 * Step 25-27 - rent/receivable due reminder. Authoritative source is
 * `PaymentSchedule` itself (the same row the scheduler discovered), never a
 * second "is this paid" calculation: `status` is re-read fresh here and is
 * the exact field `recomputeScheduleStatus()` already maintains as
 * authoritative everywhere else in this codebase.
 *
 * Step 76's mandatory recheck: a job created when 10,000 was due must skip
 * silently if the tenant paid before the job ran. Re-validates THREE things
 * fresh, never trusting the job's own snapshot for anything except "was
 * this the due date we scheduled against":
 *  1. the schedule still exists and is not PAID/CANCELLED;
 *  2. the schedule's OWN CURRENT dueDate still matches what this job was
 *     scheduled against (a changed due date makes this a stale reminder for
 *     a due date that no longer exists - Step 19's job-key versioning);
 *  3. the parent Contract is still ACTIVE.
 */
export const rentDueReminderHandler: AutomationHandler = async (ctx) => {
  if (!isRentDueReminderPayload(ctx.payloadJson)) {
    return { kind: "PERMANENT_FAILURE", errorCode: "INVALID_PAYLOAD", errorMessage: "rent-due-reminder payload is missing required fields" };
  }
  const payload = ctx.payloadJson;

  const schedule = await prisma.paymentSchedule.findFirst({
    where: { id: payload.scheduleId, organizationId: ctx.organizationId },
    include: { contract: { include: { renter: true, unit: true } } },
  });
  if (!schedule) return { kind: "SKIPPED", reason: "PaymentSchedule no longer exists" };
  if (schedule.status === "PAID" || schedule.status === "CANCELLED") {
    return { kind: "SKIPPED", reason: `schedule status is now ${schedule.status} - already resolved` };
  }
  if (schedule.dueDate.toISOString() !== payload.dueDate) {
    return { kind: "SKIPPED", reason: "due date changed since this reminder was scheduled" };
  }
  if (schedule.contract.status !== "ACTIVE") {
    return { kind: "SKIPPED", reason: `contract status is ${schedule.contract.status}, not ACTIVE` };
  }

  await prisma.$transaction(async (tx) => {
    await emitCommunicationEventTx(tx, {
      organizationId: ctx.organizationId,
      eventType: "RENT_DUE_REMINDER",
      eventKey: rentDueReminderKey(schedule.id, payload.offsetDays, schedule.dueDate),
      businessEntityType: "PaymentSchedule",
      businessEntityId: schedule.id,
      // No request-context locale exists inside a scheduled job - English
      // fallback, matching resolveNotificationLanguage()'s own documented
      // behavior for a non-request-context trigger.
      language: "en",
      variables: {
        amount: schedule.amount.toString(),
        currency: "SAR",
        dueDate: schedule.dueDate.toISOString().slice(0, 10),
        unitNumber: schedule.contract.unit.unitNumber,
        renterName: schedule.contract.renter.fullName,
      },
      recipients: [buildRenterRecipient(schedule.contract.renter)],
    });
  });

  return { kind: "COMPLETED" };
};
