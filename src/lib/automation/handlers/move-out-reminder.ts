import { prisma } from "@/lib/prisma";
import { buildRenterRecipient } from "@/lib/communications/recipients";
import { emitCommunicationEventTx } from "../outbox-emit";
import { moveOutReminderKey } from "../job-keys";
import type { AutomationHandler } from "../handler-types";

export interface MoveOutReminderPayload {
  moveOutId: string;
  offsetDays: number;
  /** Snapshotted MoveOut.scheduledAt ISO string at schedule time. */
  scheduledAt: string;
}

export function isMoveOutReminderPayload(payload: unknown): payload is MoveOutReminderPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as Record<string, unknown>).moveOutId === "string" &&
    typeof (payload as Record<string, unknown>).offsetDays === "number" &&
    typeof (payload as Record<string, unknown>).scheduledAt === "string"
  );
}

/** Step 33 - same reasoning as move-in-reminder.ts, applied to Move-Out. Step 79's mandatory recheck. */
export const moveOutReminderHandler: AutomationHandler = async (ctx) => {
  if (!isMoveOutReminderPayload(ctx.payloadJson)) {
    return { kind: "PERMANENT_FAILURE", errorCode: "INVALID_PAYLOAD", errorMessage: "move-out-reminder payload is missing required fields" };
  }
  const payload = ctx.payloadJson;

  const moveOut = await prisma.moveOut.findFirst({
    where: { id: payload.moveOutId, organizationId: ctx.organizationId },
    include: { renter: true, unit: true },
  });
  if (!moveOut) return { kind: "SKIPPED", reason: "MoveOut no longer exists" };
  if (moveOut.status !== "SCHEDULED") return { kind: "SKIPPED", reason: `move-out status is now ${moveOut.status}, not SCHEDULED` };
  if (!moveOut.scheduledAt || moveOut.scheduledAt.toISOString() !== payload.scheduledAt) {
    return { kind: "SKIPPED", reason: "scheduled time changed since this reminder was scheduled" };
  }

  await prisma.$transaction(async (tx) => {
    await emitCommunicationEventTx(tx, {
      organizationId: ctx.organizationId,
      eventType: "MOVE_OUT_REMINDER",
      eventKey: moveOutReminderKey(moveOut.id, payload.offsetDays, moveOut.scheduledAt!),
      businessEntityType: "MoveOut",
      businessEntityId: moveOut.id,
      language: "en",
      variables: {
        moveOutNumber: moveOut.moveOutNumber,
        scheduledAt: moveOut.scheduledAt!.toISOString().slice(0, 10),
        unitNumber: moveOut.unit.unitNumber,
      },
      recipients: [buildRenterRecipient(moveOut.renter)],
    });
  });

  return { kind: "COMPLETED" };
};
