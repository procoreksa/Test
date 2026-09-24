import type { AutomationJobType } from "@prisma/client";
import type { AutomationHandler } from "../handler-types";
import { rentDueReminderHandler } from "./rent-due-reminder";
import { contractExpiryReminderHandler } from "./contract-expiry-reminder";
import { moveInReminderHandler } from "./move-in-reminder";
import { moveOutReminderHandler } from "./move-out-reminder";
import { maintenanceSlaCheckHandler } from "./maintenance-sla-check";

/**
 * Step 54 - the central handler registry: a plain object literal mapping
 * `jobType -> handler`, never a dynamic import/eval from DB-stored data. An
 * `AutomationJobType` with no entry here (a future rollback scenario, or a
 * type added to the enum before its handler ships) is looked up as
 * `undefined` by the worker and fails safely and permanently
 * (src/lib/automation/worker.ts).
 */
export const AUTOMATION_HANDLERS: Partial<Record<AutomationJobType, AutomationHandler>> = {
  RENT_DUE_REMINDER: rentDueReminderHandler,
  CONTRACT_EXPIRY_REMINDER: contractExpiryReminderHandler,
  MOVE_IN_REMINDER: moveInReminderHandler,
  MOVE_OUT_REMINDER: moveOutReminderHandler,
  MAINTENANCE_SLA_CHECK: maintenanceSlaCheckHandler,
  // COMMUNICATION_RECONCILIATION is executed directly by the reconciliation
  // route (src/lib/automation/reconciliation.ts), not through this
  // per-record handler contract - see that module's own doc comment for why.
};
