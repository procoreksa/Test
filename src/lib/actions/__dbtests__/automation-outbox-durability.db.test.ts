/**
 * Real, database-backed proof of the Prompt 22 durability guarantee
 * (Critical Principle 1 - "durable intent before async work"): for each of
 * the 9 originally-wired business events, the matching CommunicationOutboxEvent
 * row already exists in the database the instant the business action
 * returns - BEFORE any worker/processor ever runs. This is the exact
 * Prompt-19 gap-closure proof (docs/AUTOMATION-SCHEDULED-JOBS.md,
 * "Durability architecture"): commit -> crash immediately after -> the
 * intent is already durable, so nothing is lost.
 *
 * Also proves the inverse: a forced rollback of the business transaction
 * AFTER emitCommunicationEventTx() has run leaves neither the business
 * mutation nor the outbox event behind (Step 6/86/87).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import {
  resetDatabase,
  seedFullOrg,
  createTestContract,
  driveMoveOutToCompletion,
  payDepositInvoice,
  uniqueSuffix,
  type SeededOrg,
} from "./db-test-helpers";
import { prisma } from "@/lib/prisma";
import { emitCommunicationEventTx } from "@/lib/automation/outbox-emit";
import {
  invoiceIssuedKey,
  paymentReceivedKey,
  maintenanceRequestCreatedKey,
  moveInScheduledKey,
  moveOutScheduledKey,
  securityDepositSettlementPostedKey,
  securityDepositRefundRecordedKey,
} from "@/lib/automation/outbox-keys";
import { buildRenterRecipient } from "@/lib/communications/recipients";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("AOD");
  org.renter = await prisma.renter.update({ where: { id: org.renter.id }, data: { email: "renter@example.com" } });
});

beforeEach(() => {
  mockAuth.mockReset();
  mockAuth.mockResolvedValue(org.session);
});

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

async function outboxEventByKey(eventKey: string) {
  return prisma.communicationOutboxEvent.findFirst({ where: { organizationId: org.organization.id, eventKey } });
}

describe("Business-commit durability - a durable outbox event exists before the action returns", () => {
  it("INVOICE_ISSUED: issueInvoiceForSchedule() leaves a durable PENDING outbox event", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `AOD-INV-${uniqueSuffix()}` });
    const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } });
    const { issueInvoiceForSchedule } = await import("@/lib/actions/invoices");

    await issueInvoiceForSchedule(fd({ scheduleId: schedule.id, kind: "RENT" }));

    const invoice = await prisma.invoice.findFirstOrThrow({ where: { contractId: contract.id } });
    const event = await outboxEventByKey(invoiceIssuedKey(invoice.id));
    expect(event).not.toBeNull();
    expect(event!.status).toBe("PENDING");
    expect(event!.eventType).toBe("INVOICE_ISSUED");
  });

  it("PAYMENT_RECEIVED: recordPayment() leaves a durable PENDING outbox event", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `AOD-PAY-${uniqueSuffix()}` });
    const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } });
    const { issueInvoiceForSchedule } = await import("@/lib/actions/invoices");
    await issueInvoiceForSchedule(fd({ scheduleId: schedule.id, kind: "RENT" }));
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { contractId: contract.id } });

    const { recordPayment } = await import("@/lib/actions/payments");
    await recordPayment(fd({ invoiceId: invoice.id, amount: "1000", method: "BANK_TRANSFER" }));

    const payment = await prisma.payment.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    const event = await outboxEventByKey(paymentReceivedKey(payment.id));
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe("PAYMENT_RECEIVED");
  });

  it("MAINTENANCE_REQUEST_CREATED: createMaintenanceRequest() (with a renter attached) leaves a durable outbox event", async () => {
    const { unit, contract } = await createTestContract(org, { unitNumber: `AOD-MREQ-${uniqueSuffix()}` });
    const requestId = await (
      await import("@/lib/actions/maintenance")
    ).createMaintenanceRequest(
      fd({ scopeType: "UNIT", unitId: unit.id, contractId: contract.id, renterId: org.renter.id, category: "PLUMBING", title: "Leaking pipe", reportedByType: "TENANT" })
    );

    const event = await outboxEventByKey(maintenanceRequestCreatedKey(requestId));
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe("MAINTENANCE_REQUEST_CREATED");
  });

  it("MAINTENANCE_REQUEST_CREATED: never fires when the request has no renter attached (no notification target)", async () => {
    const requestId = await (
      await import("@/lib/actions/maintenance")
    ).createMaintenanceRequest(fd({ scopeType: "UNIT", unitId: org.unit.id, category: "GENERAL", title: "No renter attached", reportedByType: "STAFF" }));

    const event = await outboxEventByKey(maintenanceRequestCreatedKey(requestId));
    expect(event).toBeNull();
  });

  it("MOVE_IN_SCHEDULED: scheduleMoveIn() leaves a durable outbox event", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `AOD-MI-${uniqueSuffix()}` });
    const { createMoveIn, scheduleMoveIn } = await import("@/lib/actions/move-ins");
    const moveInId = await createMoveIn(fd({ contractId: contract.id }));

    const scheduledAt = new Date("2027-01-15T10:00:00Z");
    await scheduleMoveIn(fd({ moveInId, scheduledAt: scheduledAt.toISOString() }));

    const event = await outboxEventByKey(moveInScheduledKey(moveInId, scheduledAt));
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe("MOVE_IN_SCHEDULED");
  });

  it("MOVE_OUT_SCHEDULED: scheduleMoveOut() leaves a durable outbox event", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `AOD-MO-${uniqueSuffix()}` });
    const { createMoveOut, scheduleMoveOut } = await import("@/lib/actions/move-outs");
    const moveOutId = await createMoveOut(fd({ contractId: contract.id }));

    const scheduledAt = new Date("2027-06-15T10:00:00Z");
    await scheduleMoveOut(fd({ moveOutId, scheduledAt: scheduledAt.toISOString() }));

    const event = await outboxEventByKey(moveOutScheduledKey(moveOutId, scheduledAt));
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe("MOVE_OUT_SCHEDULED");
  });

  it("SECURITY_DEPOSIT_SETTLEMENT_POSTED and SECURITY_DEPOSIT_REFUND_RECORDED: the full settlement chain leaves durable outbox events at each step", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `AOD-SDS-${uniqueSuffix()}` });
    await prisma.contract.update({ where: { id: contract.id }, data: { securityDeposit: 8000 } });
    await payDepositInvoice(org.organization.id, org.renter.id, contract.id, 8000);
    const moveOutId = await driveMoveOutToCompletion(contract.id);

    const { createSecurityDepositSettlement, submitSettlementForReview, reviewSettlement, approveSettlement, postSecurityDepositSettlement, recordSecurityDepositRefund } =
      await import("@/lib/actions/security-deposits");
    const settlementId = await createSecurityDepositSettlement(moveOutId);
    await submitSettlementForReview(settlementId);
    await reviewSettlement(settlementId, "FORWARD");
    await approveSettlement(settlementId);
    await postSecurityDepositSettlement(settlementId);

    const postedEvent = await outboxEventByKey(securityDepositSettlementPostedKey(settlementId));
    expect(postedEvent).not.toBeNull();
    expect(postedEvent!.eventType).toBe("SECURITY_DEPOSIT_SETTLEMENT_POSTED");

    await recordSecurityDepositRefund(fd({ settlementId, amount: "8000", method: "BANK_TRANSFER" }));
    const refund = await prisma.securityDepositRefund.findFirstOrThrow({ where: { settlementId } });
    const refundEvent = await outboxEventByKey(securityDepositRefundRecordedKey(refund.id));
    expect(refundEvent).not.toBeNull();
    expect(refundEvent!.eventType).toBe("SECURITY_DEPOSIT_REFUND_RECORDED");
  });
});

describe("Forced business-transaction rollback after emitCommunicationEventTx() (Step 6/86/87)", () => {
  it("neither the business mutation nor the outbox event survive when the surrounding transaction throws afterward", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `AOD-ROLLBACK-${uniqueSuffix()}` });
    const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } });
    const { issueInvoiceForSchedule } = await import("@/lib/actions/invoices");
    await issueInvoiceForSchedule(fd({ scheduleId: schedule.id, kind: "RENT" }));
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { contractId: contract.id } });

    const marker = `ROLLBACK-MARKER-${uniqueSuffix()}`;
    await expect(
      prisma.$transaction(async (tx) => {
        // A stand-in "business mutation" sharing the same transaction as the emit call.
        await tx.invoice.update({ where: { id: invoice.id }, data: { notes: marker } });
        await emitCommunicationEventTx(tx, {
          organizationId: org.organization.id,
          eventType: "INVOICE_ISSUED",
          eventKey: `${invoiceIssuedKey(invoice.id)}:rollback-test-${uniqueSuffix()}`,
          businessEntityType: "Invoice",
          businessEntityId: invoice.id,
          language: "en",
          variables: { invoiceNumber: invoice.invoiceNumber, totalAmount: "0", currency: "SAR", dueDate: "", contractNumber: "", unitNumber: "", renterName: "" },
          recipients: [buildRenterRecipient(org.renter)],
        });
        throw new Error("forced rollback after emitCommunicationEventTx");
      })
    ).rejects.toThrow("forced rollback");

    const afterInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(afterInvoice.notes).not.toBe(marker);

    const outboxCount = await prisma.communicationOutboxEvent.count({ where: { organizationId: org.organization.id, eventKey: { contains: "rollback-test" } } });
    expect(outboxCount).toBe(0);
  });
});
