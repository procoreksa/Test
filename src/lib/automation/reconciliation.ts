import type { CommunicationEventType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildRenterRecipient } from "@/lib/communications/recipients";
import { OUTBOX_PAYLOAD_VERSION, type OutboxPayloadV1 } from "./outbox-emit";
import {
  invoiceIssuedKey,
  paymentReceivedKey,
  maintenanceRequestCreatedKey,
  maintenanceScheduledKey,
  maintenanceCompletedKey,
  moveInScheduledKey,
  moveOutScheduledKey,
  securityDepositSettlementPostedKey,
  securityDepositRefundRecordedKey,
} from "./outbox-keys";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The instant the outbox durability guarantee (Critical Principle 1) went
 * live. Reconciliation NEVER considers a business record created before
 * this cutoff, even though it has no matching CommunicationOutboxEvent -
 * such a record predates the durability guarantee entirely and was never
 * expected to produce one (Step 16/85's "historical safety" requirement: a
 * pre-feature record must never suddenly, unexpectedly notify a renter
 * months after the fact). See docs/AUTOMATION-SCHEDULED-JOBS.md,
 * "Reconciliation - historical safety."
 */
export const RECONCILIATION_LAUNCH_AT = new Date("2026-09-24T00:00:00.000Z");

/**
 * How far back each reconciliation run re-examines, from "now". Generously
 * overlapping with itself run-over-run (the job is meant to run at most
 * daily/hourly - docs/AUTOMATION-SCHEDULED-JOBS.md, "Production trigger &
 * cadence") so a missed run or a brief outage can never open a permanent
 * gap. Never unbounded - this is defense-in-depth against a rare bug or
 * infra failure in the same-transaction outbox insert, not a replacement
 * for it (Critical Principle 3: at-least-once, never a primary mechanism).
 */
export const RECONCILIATION_LOOKBACK_DAYS = 7;

export function windowStart(now: Date): Date {
  const lookback = new Date(now.getTime() - RECONCILIATION_LOOKBACK_DAYS * DAY_MS);
  return lookback > RECONCILIATION_LAUNCH_AT ? lookback : RECONCILIATION_LAUNCH_AT;
}

type OutboxCreateInput = Prisma.CommunicationOutboxEventCreateManyInput;

function toCreateInput(params: {
  organizationId: string;
  eventType: CommunicationEventType;
  eventKey: string;
  businessEntityType: string;
  businessEntityId: string;
  variables: Record<string, string>;
  recipients: OutboxPayloadV1["recipients"];
}): OutboxCreateInput {
  const payload: OutboxPayloadV1 = {
    businessEntityType: params.businessEntityType,
    businessEntityId: params.businessEntityId,
    // English fallback - reconciliation runs with no request context, same
    // documented convention as every scheduled-job handler (src/lib/
    // communications/language.ts).
    language: "en",
    variables: params.variables,
    recipients: params.recipients,
  };
  return {
    organizationId: params.organizationId,
    eventType: params.eventType,
    eventKey: params.eventKey,
    payloadVersion: OUTBOX_PAYLOAD_VERSION,
    payloadJson: payload as unknown as Prisma.InputJsonValue,
  };
}

/**
 * Inserts every candidate row, relying on the DB-unique
 * `(organizationId, eventType, eventKey)` constraint (`skipDuplicates`) to
 * make an already-durable logical occurrence a silent no-op - the same
 * idempotency guarantee `emitCommunicationEventTx()` provides for the
 * primary path (Step 5/17). `createMany()`'s returned count is exactly how
 * many NEW rows this call actually created, so "second run creates zero
 * duplicates" (Step 91) holds by construction, not by convention.
 */
async function insertMissing(data: OutboxCreateInput[]): Promise<number> {
  if (data.length === 0) return 0;
  const result = await prisma.communicationOutboxEvent.createMany({ data, skipDuplicates: true });
  return result.count;
}

export interface ReconciliationEventResult {
  eventType: CommunicationEventType;
  scanned: number;
  created: number;
}

export interface RunCommunicationReconciliationResult {
  results: ReconciliationEventResult[];
  totalScanned: number;
  totalCreated: number;
}

async function reconcileInvoiceIssued(from: Date, to: Date): Promise<ReconciliationEventResult> {
  const invoices = await prisma.invoice.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: {
      id: true,
      organizationId: true,
      invoiceNumber: true,
      totalAmount: true,
      currency: true,
      dueDate: true,
      contract: { select: { contractNumber: true, unit: { select: { unitNumber: true } } } },
      renter: { select: { id: true, fullName: true, email: true, phone: true } },
    },
  });
  const data = invoices.map((invoice) =>
    toCreateInput({
      organizationId: invoice.organizationId,
      eventType: "INVOICE_ISSUED",
      eventKey: invoiceIssuedKey(invoice.id),
      businessEntityType: "Invoice",
      businessEntityId: invoice.id,
      variables: {
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: invoice.totalAmount.toString(),
        currency: invoice.currency,
        dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : "",
        contractNumber: invoice.contract?.contractNumber ?? "",
        unitNumber: invoice.contract?.unit.unitNumber ?? "",
        renterName: invoice.renter.fullName,
      },
      recipients: [buildRenterRecipient(invoice.renter)],
    })
  );
  return { eventType: "INVOICE_ISSUED", scanned: invoices.length, created: await insertMissing(data) };
}

async function reconcilePaymentReceived(from: Date, to: Date): Promise<ReconciliationEventResult> {
  const payments = await prisma.payment.findMany({
    // Reversal entries (negative-amount rows recording a correction) never
    // produced a PAYMENT_RECEIVED event at the primary call site either
    // (src/lib/actions/payments.ts's recordPayment() is the only call
    // site) - excluded here so reconciliation never invents one.
    where: { createdAt: { gte: from, lte: to }, reversalOfPaymentId: null },
    select: {
      id: true,
      organizationId: true,
      receiptNumber: true,
      amount: true,
      paymentDate: true,
      invoice: { select: { invoiceNumber: true, currency: true } },
      renter: { select: { id: true, fullName: true, email: true, phone: true } },
    },
  });
  const data = payments.map((payment) =>
    toCreateInput({
      organizationId: payment.organizationId,
      eventType: "PAYMENT_RECEIVED",
      eventKey: paymentReceivedKey(payment.id),
      businessEntityType: "Payment",
      businessEntityId: payment.id,
      variables: {
        receiptNumber: payment.receiptNumber,
        amount: payment.amount.toString(),
        currency: payment.invoice.currency,
        paymentDate: payment.paymentDate.toISOString().slice(0, 10),
        invoiceNumber: payment.invoice.invoiceNumber,
        renterName: payment.renter.fullName,
      },
      recipients: [buildRenterRecipient(payment.renter)],
    })
  );
  return { eventType: "PAYMENT_RECEIVED", scanned: payments.length, created: await insertMissing(data) };
}

async function reconcileMaintenanceRequestCreated(from: Date, to: Date): Promise<ReconciliationEventResult> {
  const requests = await prisma.maintenanceRequest.findMany({
    where: { createdAt: { gte: from, lte: to }, renterId: { not: null } },
    select: {
      id: true,
      organizationId: true,
      requestNumber: true,
      title: true,
      category: true,
      priority: true,
      unit: { select: { unitNumber: true } },
      renter: { select: { id: true, fullName: true, email: true, phone: true } },
    },
  });
  const data = requests
    .filter((r) => r.renter !== null)
    .map((request) =>
      toCreateInput({
        organizationId: request.organizationId,
        eventType: "MAINTENANCE_REQUEST_CREATED",
        eventKey: maintenanceRequestCreatedKey(request.id),
        businessEntityType: "MaintenanceRequest",
        businessEntityId: request.id,
        variables: {
          requestNumber: request.requestNumber,
          title: request.title,
          category: request.category,
          priority: request.priority,
          unitNumber: request.unit?.unitNumber ?? "",
        },
        recipients: [buildRenterRecipient(request.renter!)],
      })
    );
  return { eventType: "MAINTENANCE_REQUEST_CREATED", scanned: requests.length, created: await insertMissing(data) };
}

async function reconcileMaintenanceScheduled(from: Date, to: Date): Promise<ReconciliationEventResult> {
  const workOrders = await prisma.maintenanceWorkOrder.findMany({
    where: { createdAt: { gte: from, lte: to }, scheduledStart: { not: null }, request: { renterId: { not: null } } },
    select: {
      id: true,
      organizationId: true,
      workOrderNumber: true,
      scheduledStart: true,
      request: {
        select: {
          requestNumber: true,
          unit: { select: { unitNumber: true } },
          renter: { select: { id: true, fullName: true, email: true, phone: true } },
        },
      },
    },
  });
  const data = workOrders
    .filter((wo) => wo.request.renter !== null)
    .map((wo) =>
      toCreateInput({
        organizationId: wo.organizationId,
        eventType: "MAINTENANCE_SCHEDULED",
        eventKey: maintenanceScheduledKey(wo.id, wo.scheduledStart!),
        businessEntityType: "MaintenanceWorkOrder",
        businessEntityId: wo.id,
        variables: {
          requestNumber: wo.request.requestNumber,
          workOrderNumber: wo.workOrderNumber,
          scheduledDate: wo.scheduledStart!.toISOString().slice(0, 10),
          unitNumber: wo.request.unit?.unitNumber ?? "",
        },
        recipients: [buildRenterRecipient(wo.request.renter!)],
      })
    );
  return { eventType: "MAINTENANCE_SCHEDULED", scanned: workOrders.length, created: await insertMissing(data) };
}

async function reconcileMaintenanceCompleted(from: Date, to: Date): Promise<ReconciliationEventResult> {
  const workOrders = await prisma.maintenanceWorkOrder.findMany({
    where: { createdAt: { gte: from, lte: to }, completedAt: { not: null }, request: { renterId: { not: null } } },
    select: {
      id: true,
      organizationId: true,
      workOrderNumber: true,
      completedAt: true,
      request: {
        select: {
          requestNumber: true,
          unit: { select: { unitNumber: true } },
          renter: { select: { id: true, fullName: true, email: true, phone: true } },
        },
      },
    },
  });
  const data = workOrders
    .filter((wo) => wo.request.renter !== null)
    .map((wo) =>
      toCreateInput({
        organizationId: wo.organizationId,
        eventType: "MAINTENANCE_COMPLETED",
        eventKey: maintenanceCompletedKey(wo.id),
        businessEntityType: "MaintenanceWorkOrder",
        businessEntityId: wo.id,
        variables: {
          requestNumber: wo.request.requestNumber,
          workOrderNumber: wo.workOrderNumber,
          completedDate: wo.completedAt!.toISOString().slice(0, 10),
          unitNumber: wo.request.unit?.unitNumber ?? "",
        },
        recipients: [buildRenterRecipient(wo.request.renter!)],
      })
    );
  return { eventType: "MAINTENANCE_COMPLETED", scanned: workOrders.length, created: await insertMissing(data) };
}

async function reconcileMoveInScheduled(from: Date, to: Date): Promise<ReconciliationEventResult> {
  const moveIns = await prisma.moveIn.findMany({
    where: { createdAt: { gte: from, lte: to }, scheduledAt: { not: null } },
    select: {
      id: true,
      organizationId: true,
      moveInNumber: true,
      scheduledAt: true,
      unit: { select: { unitNumber: true } },
      contract: { select: { contractNumber: true } },
      renter: { select: { id: true, fullName: true, email: true, phone: true } },
    },
  });
  const data = moveIns.map((moveIn) =>
    toCreateInput({
      organizationId: moveIn.organizationId,
      eventType: "MOVE_IN_SCHEDULED",
      eventKey: moveInScheduledKey(moveIn.id, moveIn.scheduledAt!),
      businessEntityType: "MoveIn",
      businessEntityId: moveIn.id,
      variables: {
        moveInNumber: moveIn.moveInNumber,
        scheduledAt: moveIn.scheduledAt!.toISOString().slice(0, 10),
        unitNumber: moveIn.unit.unitNumber,
        contractNumber: moveIn.contract.contractNumber,
      },
      recipients: [buildRenterRecipient(moveIn.renter)],
    })
  );
  return { eventType: "MOVE_IN_SCHEDULED", scanned: moveIns.length, created: await insertMissing(data) };
}

async function reconcileMoveOutScheduled(from: Date, to: Date): Promise<ReconciliationEventResult> {
  const moveOuts = await prisma.moveOut.findMany({
    where: { createdAt: { gte: from, lte: to }, scheduledAt: { not: null } },
    select: {
      id: true,
      organizationId: true,
      moveOutNumber: true,
      scheduledAt: true,
      unit: { select: { unitNumber: true } },
      contract: { select: { contractNumber: true } },
      renter: { select: { id: true, fullName: true, email: true, phone: true } },
    },
  });
  const data = moveOuts.map((moveOut) =>
    toCreateInput({
      organizationId: moveOut.organizationId,
      eventType: "MOVE_OUT_SCHEDULED",
      eventKey: moveOutScheduledKey(moveOut.id, moveOut.scheduledAt!),
      businessEntityType: "MoveOut",
      businessEntityId: moveOut.id,
      variables: {
        moveOutNumber: moveOut.moveOutNumber,
        scheduledAt: moveOut.scheduledAt!.toISOString().slice(0, 10),
        unitNumber: moveOut.unit.unitNumber,
        contractNumber: moveOut.contract.contractNumber,
      },
      recipients: [buildRenterRecipient(moveOut.renter)],
    })
  );
  return { eventType: "MOVE_OUT_SCHEDULED", scanned: moveOuts.length, created: await insertMissing(data) };
}

async function reconcileSecurityDepositSettlementPosted(from: Date, to: Date): Promise<ReconciliationEventResult> {
  const settlements = await prisma.securityDepositSettlement.findMany({
    // postedAt is set exactly once, exactly when postSecurityDepositSettlement()
    // runs (src/lib/actions/security-deposits.ts) - the same signal the
    // primary call site's own transaction acts on.
    where: { postedAt: { not: null, gte: from, lte: to } },
    select: {
      id: true,
      organizationId: true,
      settlementNumber: true,
      approvedRefundDue: true,
      approvedAdditionalDue: true,
      unit: { select: { unitNumber: true } },
      renter: { select: { id: true, fullName: true, email: true, phone: true } },
    },
  });
  const data = settlements.map((settlement) =>
    toCreateInput({
      organizationId: settlement.organizationId,
      eventType: "SECURITY_DEPOSIT_SETTLEMENT_POSTED",
      eventKey: securityDepositSettlementPostedKey(settlement.id),
      businessEntityType: "SecurityDepositSettlement",
      businessEntityId: settlement.id,
      variables: {
        settlementNumber: settlement.settlementNumber,
        refundDue: (settlement.approvedRefundDue ?? 0).toString(),
        additionalDue: (settlement.approvedAdditionalDue ?? 0).toString(),
        currency: "SAR",
        unitNumber: settlement.unit.unitNumber,
      },
      recipients: [buildRenterRecipient(settlement.renter)],
    })
  );
  return { eventType: "SECURITY_DEPOSIT_SETTLEMENT_POSTED", scanned: settlements.length, created: await insertMissing(data) };
}

async function reconcileSecurityDepositRefundRecorded(from: Date, to: Date): Promise<ReconciliationEventResult> {
  const refunds = await prisma.securityDepositRefund.findMany({
    where: { createdAt: { gte: from, lte: to }, status: "PAID" },
    select: {
      id: true,
      organizationId: true,
      amount: true,
      method: true,
      settlement: {
        select: {
          settlementNumber: true,
          unit: { select: { unitNumber: true } },
          renter: { select: { id: true, fullName: true, email: true, phone: true } },
        },
      },
    },
  });
  const data = refunds.map((refund) =>
    toCreateInput({
      organizationId: refund.organizationId,
      eventType: "SECURITY_DEPOSIT_REFUND_RECORDED",
      eventKey: securityDepositRefundRecordedKey(refund.id),
      businessEntityType: "SecurityDepositRefund",
      businessEntityId: refund.id,
      variables: {
        settlementNumber: refund.settlement.settlementNumber,
        refundAmount: refund.amount.toString(),
        currency: "SAR",
        method: refund.method ?? "",
        unitNumber: refund.settlement.unit.unitNumber,
      },
      recipients: [buildRenterRecipient(refund.settlement.renter)],
    })
  );
  return { eventType: "SECURITY_DEPOSIT_REFUND_RECORDED", scanned: refunds.length, created: await insertMissing(data) };
}

/**
 * Step 15/91 - reconciliation as defense-in-depth ONLY. This is never the
 * primary durability mechanism (that is the same-transaction outbox insert,
 * Critical Principle 1) and never claimed as exactly-once (Critical
 * Principle 3) - it is a bounded, periodic safety net that re-derives the
 * expected CommunicationOutboxEvent for each of the 9 originally-wired
 * business events directly from its own authoritative source table, and
 * fills in only what is durably missing.
 *
 * Deliberately NOT gated by AutomationSettings (Step 38's opt-in default
 * applies only to the four tenant-facing scheduled reminder types) - this
 * is a system reliability job, always on, the same tier as the outbox
 * processor and communication delivery worker.
 *
 * Runs across every organization in one bounded invocation (never
 * per-organization AutomationJob rows - see src/lib/automation/handlers/
 * index.ts's doc comment for why) - multi-tenancy is preserved because
 * every inserted row's `organizationId` is read directly off that row's own
 * source record, never assumed or cross-applied.
 */
export async function runCommunicationReconciliation(now: Date = new Date()): Promise<RunCommunicationReconciliationResult> {
  const from = windowStart(now);

  const results = await Promise.all([
    reconcileInvoiceIssued(from, now),
    reconcilePaymentReceived(from, now),
    reconcileMaintenanceRequestCreated(from, now),
    reconcileMaintenanceScheduled(from, now),
    reconcileMaintenanceCompleted(from, now),
    reconcileMoveInScheduled(from, now),
    reconcileMoveOutScheduled(from, now),
    reconcileSecurityDepositSettlementPosted(from, now),
    reconcileSecurityDepositRefundRecorded(from, now),
  ]);

  return {
    results,
    totalScanned: results.reduce((sum, r) => sum + r.scanned, 0),
    totalCreated: results.reduce((sum, r) => sum + r.created, 0),
  };
}
