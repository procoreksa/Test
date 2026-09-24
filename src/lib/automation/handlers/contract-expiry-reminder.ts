import { prisma } from "@/lib/prisma";
import { buildRenterRecipient } from "@/lib/communications/recipients";
import { emitCommunicationEventTx } from "../outbox-emit";
import { contractExpiryReminderKey } from "../job-keys";
import type { AutomationHandler } from "../handler-types";

export interface ContractExpiryReminderPayload {
  contractId: string;
  offsetDays: number;
  /** Snapshotted Contract.endDate ISO string at schedule time. */
  endDate: string;
}

export function isContractExpiryReminderPayload(payload: unknown): payload is ContractExpiryReminderPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as Record<string, unknown>).contractId === "string" &&
    typeof (payload as Record<string, unknown>).offsetDays === "number" &&
    typeof (payload as Record<string, unknown>).endDate === "string"
  );
}

/**
 * Step 30 - reminder only. Never renews, never terminates, never mutates
 * Contract.status (Step 31/73 - the pre-existing `ContractStatus.EXPIRED`-
 * never-set gap from the Step 1 audit is deliberately left untouched here;
 * fixing it is out of this module's scope and would risk the Unit-vacancy/
 * Move-Out/renewal interactions the Executive Dashboards audit already
 * flagged).
 *
 * Step 77's mandatory recheck: a renewal before execution must skip the
 * stale reminder. `renewedIntoContract` being set, the contract no longer
 * being ACTIVE, or the endDate having since changed (a manual edit) are all
 * treated as "no longer eligible."
 */
export const contractExpiryReminderHandler: AutomationHandler = async (ctx) => {
  if (!isContractExpiryReminderPayload(ctx.payloadJson)) {
    return { kind: "PERMANENT_FAILURE", errorCode: "INVALID_PAYLOAD", errorMessage: "contract-expiry-reminder payload is missing required fields" };
  }
  const payload = ctx.payloadJson;

  const contract = await prisma.contract.findFirst({
    where: { id: payload.contractId, organizationId: ctx.organizationId },
    include: { renter: true, unit: true, renewedIntoContract: { select: { id: true } } },
  });
  if (!contract) return { kind: "SKIPPED", reason: "Contract no longer exists" };
  if (contract.status !== "ACTIVE") return { kind: "SKIPPED", reason: `contract status is now ${contract.status}, not ACTIVE` };
  if (contract.renewedIntoContract) return { kind: "SKIPPED", reason: "contract has already been renewed into a successor contract" };
  if (contract.endDate.toISOString() !== payload.endDate) return { kind: "SKIPPED", reason: "end date changed since this reminder was scheduled" };

  await prisma.$transaction(async (tx) => {
    await emitCommunicationEventTx(tx, {
      organizationId: ctx.organizationId,
      eventType: "CONTRACT_EXPIRY_REMINDER",
      eventKey: contractExpiryReminderKey(contract.id, payload.offsetDays, contract.endDate),
      businessEntityType: "Contract",
      businessEntityId: contract.id,
      language: "en",
      variables: {
        contractNumber: contract.contractNumber,
        endDate: contract.endDate.toISOString().slice(0, 10),
        unitNumber: contract.unit.unitNumber,
        renterName: contract.renter.fullName,
      },
      recipients: [buildRenterRecipient(contract.renter)],
    });
  });

  return { kind: "COMPLETED" };
};
