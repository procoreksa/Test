import type { CommunicationEventType, CommunicationRecipientStrategy } from "@prisma/client";

/**
 * Centralized business-event vocabulary and metadata. This is the single
 * place a new notification-worthy business event is described - adding an
 * entry here does NOT by itself send anything (see `wired` below).
 *
 * `classification` is a static property here, not a database column: all 9
 * `wired` events are TRANSACTIONAL (must always be delivered - see
 * docs/NOTIFICATIONS-COMMUNICATIONS.md, "Transactional vs Optional"), so
 * CommunicationPreference's opt-out suppression currently only ever applies
 * to a future OPTIONAL event. No marketing/campaign event type exists or
 * ever should (see the module's explicit no-feature-creep list).
 */
export type CommunicationClassification = "TRANSACTIONAL" | "OPTIONAL";

export interface CommunicationEventDefinition {
  eventType: CommunicationEventType;
  classification: CommunicationClassification;
  /**
   * True only for the 9 events with an actual call-site integration
   * (enqueueCommunicationEvent() invoked from the real business action) and
   * a seeded default CommunicationRule. Every other event exists in the
   * vocabulary/enum for completeness but fires nothing - defining an event
   * type must never silently auto-enable it.
   */
  wired: boolean;
  defaultRecipientStrategy: CommunicationRecipientStrategy | null;
  /** The exhaustive allow-listed `{{variableName}}` set this event's payload provides to templates. */
  variables: readonly string[];
  description: string;
}

export const COMMUNICATION_EVENT_REGISTRY: Record<CommunicationEventType, CommunicationEventDefinition> = {
  INVOICE_ISSUED: {
    eventType: "INVOICE_ISSUED",
    classification: "TRANSACTIONAL",
    wired: true,
    defaultRecipientStrategy: "RENTER",
    variables: ["invoiceNumber", "totalAmount", "currency", "dueDate", "contractNumber", "unitNumber", "renterName"],
    description: "A tax invoice was issued to a renter.",
  },
  PAYMENT_RECEIVED: {
    eventType: "PAYMENT_RECEIVED",
    classification: "TRANSACTIONAL",
    wired: true,
    defaultRecipientStrategy: "RENTER",
    variables: ["receiptNumber", "amount", "currency", "paymentDate", "invoiceNumber", "renterName"],
    description: "A payment was recorded against a renter's invoice.",
  },
  MAINTENANCE_REQUEST_CREATED: {
    eventType: "MAINTENANCE_REQUEST_CREATED",
    classification: "TRANSACTIONAL",
    wired: true,
    defaultRecipientStrategy: "RENTER",
    variables: ["requestNumber", "title", "category", "priority", "unitNumber"],
    description: "A maintenance request was created for a renter's unit.",
  },
  MAINTENANCE_SCHEDULED: {
    eventType: "MAINTENANCE_SCHEDULED",
    classification: "TRANSACTIONAL",
    wired: true,
    defaultRecipientStrategy: "RENTER",
    variables: ["requestNumber", "workOrderNumber", "scheduledDate", "unitNumber"],
    description: "A maintenance work order visit was scheduled.",
  },
  MAINTENANCE_COMPLETED: {
    eventType: "MAINTENANCE_COMPLETED",
    classification: "TRANSACTIONAL",
    wired: true,
    defaultRecipientStrategy: "RENTER",
    variables: ["requestNumber", "workOrderNumber", "completedDate", "unitNumber"],
    description: "A maintenance work order was completed.",
  },
  MOVE_IN_SCHEDULED: {
    eventType: "MOVE_IN_SCHEDULED",
    classification: "TRANSACTIONAL",
    wired: true,
    defaultRecipientStrategy: "RENTER",
    variables: ["moveInNumber", "scheduledAt", "unitNumber", "contractNumber"],
    description: "A Move-In handover was scheduled for a renter.",
  },
  MOVE_OUT_SCHEDULED: {
    eventType: "MOVE_OUT_SCHEDULED",
    classification: "TRANSACTIONAL",
    wired: true,
    defaultRecipientStrategy: "RENTER",
    variables: ["moveOutNumber", "scheduledAt", "unitNumber", "contractNumber"],
    description: "A Move-Out hand-back was scheduled for a renter.",
  },
  SECURITY_DEPOSIT_SETTLEMENT_POSTED: {
    eventType: "SECURITY_DEPOSIT_SETTLEMENT_POSTED",
    classification: "TRANSACTIONAL",
    wired: true,
    defaultRecipientStrategy: "RENTER",
    variables: ["settlementNumber", "refundDue", "additionalDue", "currency", "unitNumber"],
    description: "A security deposit settlement was posted.",
  },
  SECURITY_DEPOSIT_REFUND_RECORDED: {
    eventType: "SECURITY_DEPOSIT_REFUND_RECORDED",
    classification: "TRANSACTIONAL",
    wired: true,
    defaultRecipientStrategy: "RENTER",
    variables: ["settlementNumber", "refundAmount", "currency", "method", "unitNumber"],
    description: "A security deposit refund was recorded.",
  },

  // --- Vocabulary defined for completeness; not wired to any call site or
  // seeded default Rule in this phase (Prompt 19). Available for a future
  // Rule to select once an integration is added. ---
  CONTRACT_CREATED: {
    eventType: "CONTRACT_CREATED",
    classification: "TRANSACTIONAL",
    wired: false,
    defaultRecipientStrategy: null,
    variables: ["contractNumber", "unitNumber", "startDate", "endDate"],
    description: "A new lease contract was created.",
  },
  CONTRACT_RENEWED: {
    eventType: "CONTRACT_RENEWED",
    classification: "TRANSACTIONAL",
    wired: false,
    defaultRecipientStrategy: null,
    variables: ["contractNumber", "unitNumber", "startDate", "endDate"],
    description: "A lease contract was renewed.",
  },
  CONTRACT_TERMINATED: {
    eventType: "CONTRACT_TERMINATED",
    classification: "TRANSACTIONAL",
    wired: false,
    defaultRecipientStrategy: null,
    variables: ["contractNumber", "unitNumber"],
    description: "A lease contract was terminated.",
  },
  RESERVATION_CONFIRMED: {
    eventType: "RESERVATION_CONFIRMED",
    classification: "TRANSACTIONAL",
    wired: false,
    defaultRecipientStrategy: null,
    variables: ["reservationNumber", "unitNumber"],
    description: "A unit reservation was confirmed.",
  },
  TENANT_PORTAL_ACCOUNT_INVITED: {
    eventType: "TENANT_PORTAL_ACCOUNT_INVITED",
    classification: "TRANSACTIONAL",
    wired: false,
    defaultRecipientStrategy: null,
    variables: ["renterName"],
    description: "A Tenant Portal account was created for a renter.",
  },
  OWNER_PORTAL_ACCOUNT_INVITED: {
    eventType: "OWNER_PORTAL_ACCOUNT_INVITED",
    classification: "TRANSACTIONAL",
    wired: false,
    defaultRecipientStrategy: null,
    variables: ["ownerName"],
    description: "An Owner Portal account was created for an owner.",
  },
  CORPORATE_ALLOCATION_ACTIVATED: {
    eventType: "CORPORATE_ALLOCATION_ACTIVATED",
    classification: "TRANSACTIONAL",
    wired: false,
    defaultRecipientStrategy: null,
    variables: ["allocationNumber", "unitNumber"],
    description: "A corporate housing allocation was activated.",
  },

  // --- Automation & Scheduled Jobs (docs/AUTOMATION-SCHEDULED-JOBS.md) -
  // emitted only from src/lib/automation/handlers/*.ts, never from a direct
  // business action. Wired, but the reminder itself is gated by a separate,
  // per-organization AutomationSettings flag (default disabled) - being
  // "wired" here only means a seeded default Rule/template CAN produce a
  // message once an organization turns the reminder on.
  RENT_DUE_REMINDER: {
    eventType: "RENT_DUE_REMINDER",
    classification: "TRANSACTIONAL",
    wired: true,
    defaultRecipientStrategy: "RENTER",
    variables: ["amount", "currency", "dueDate", "unitNumber", "renterName"],
    description: "A rent/receivable amount is due soon, due today, or overdue.",
  },
  CONTRACT_EXPIRY_REMINDER: {
    eventType: "CONTRACT_EXPIRY_REMINDER",
    classification: "TRANSACTIONAL",
    wired: true,
    defaultRecipientStrategy: "RENTER",
    variables: ["contractNumber", "endDate", "unitNumber", "renterName"],
    description: "A lease contract is approaching its end date.",
  },
  MOVE_IN_REMINDER: {
    eventType: "MOVE_IN_REMINDER",
    classification: "TRANSACTIONAL",
    wired: true,
    defaultRecipientStrategy: "RENTER",
    variables: ["moveInNumber", "scheduledAt", "unitNumber"],
    description: "A scheduled Move-In handover is coming up.",
  },
  MOVE_OUT_REMINDER: {
    eventType: "MOVE_OUT_REMINDER",
    classification: "TRANSACTIONAL",
    wired: true,
    defaultRecipientStrategy: "RENTER",
    variables: ["moveOutNumber", "scheduledAt", "unitNumber"],
    description: "A scheduled Move-Out hand-back is coming up.",
  },
};

export function getEventDefinition(eventType: CommunicationEventType): CommunicationEventDefinition {
  return COMMUNICATION_EVENT_REGISTRY[eventType];
}

export function isWiredEvent(eventType: CommunicationEventType): boolean {
  return COMMUNICATION_EVENT_REGISTRY[eventType].wired;
}

export const WIRED_EVENT_TYPES: readonly CommunicationEventType[] = Object.values(COMMUNICATION_EVENT_REGISTRY)
  .filter((e) => e.wired)
  .map((e) => e.eventType);
