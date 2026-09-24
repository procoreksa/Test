import { prisma } from "@/lib/prisma";
import { buildRenterRecipient } from "@/lib/communications/recipients";
import { emitCommunicationEventTx } from "../outbox-emit";
import { moveInReminderKey } from "../job-keys";
import type { AutomationHandler } from "../handler-types";

export interface MoveInReminderPayload {
  moveInId: string;
  offsetDays: number;
  /** Snapshotted MoveIn.scheduledAt ISO string at schedule time. */
  scheduledAt: string;
}

export function isMoveInReminderPayload(payload: unknown): payload is MoveInReminderPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as Record<string, unknown>).moveInId === "string" &&
    typeof (payload as Record<string, unknown>).offsetDays === "number" &&
    typeof (payload as Record<string, unknown>).scheduledAt === "string"
  );
}

/**
 * Step 32 - reminder only, never mutates the Move-In. Step 78's mandatory
 * recheck: a cancelled or rescheduled Move-In before execution must skip
 * the stale reminder - `status` must still be SCHEDULED (not CANCELLED, not
 * already IN_PROGRESS/COMPLETED) and `scheduledAt` must still match what
 * this job was scheduled against.
 */
export const moveInReminderHandler: AutomationHandler = async (ctx) => {
  if (!isMoveInReminderPayload(ctx.payloadJson)) {
    return { kind: "PERMANENT_FAILURE", errorCode: "INVALID_PAYLOAD", errorMessage: "move-in-reminder payload is missing required fields" };
  }
  const payload = ctx.payloadJson;

  const moveIn = await prisma.moveIn.findFirst({
    where: { id: payload.moveInId, organizationId: ctx.organizationId },
    include: { renter: true, unit: true },
  });
  if (!moveIn) return { kind: "SKIPPED", reason: "MoveIn no longer exists" };
  if (moveIn.status !== "SCHEDULED") return { kind: "SKIPPED", reason: `move-in status is now ${moveIn.status}, not SCHEDULED` };
  if (!moveIn.scheduledAt || moveIn.scheduledAt.toISOString() !== payload.scheduledAt) {
    return { kind: "SKIPPED", reason: "scheduled time changed since this reminder was scheduled" };
  }

  await prisma.$transaction(async (tx) => {
    await emitCommunicationEventTx(tx, {
      organizationId: ctx.organizationId,
      eventType: "MOVE_IN_REMINDER",
      eventKey: moveInReminderKey(moveIn.id, payload.offsetDays, moveIn.scheduledAt!),
      businessEntityType: "MoveIn",
      businessEntityId: moveIn.id,
      language: "en",
      variables: {
        moveInNumber: moveIn.moveInNumber,
        scheduledAt: moveIn.scheduledAt!.toISOString().slice(0, 10),
        unitNumber: moveIn.unit.unitNumber,
      },
      recipients: [buildRenterRecipient(moveIn.renter)],
    });
  });

  return { kind: "COMPLETED" };
};
