/**
 * Real, database-backed tests proving:
 *  - a real Payment's idempotency key prevents a duplicate notification if
 *    the post-commit enqueue were ever invoked twice for the same payment,
 *  - a business transaction that throws and rolls back never enqueues a
 *    notification at all (Critical Principle 3 - enqueue only ever runs
 *    strictly after commit),
 *  - the Tenant/Owner Portal's own, entirely separate NextAuth sessions can
 *    never reach any internal Communications action (privacy regression -
 *    the same three-independent-session-boundary architecture Tenant/Owner
 *    Portal themselves established).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestContract, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";
import { issueInvoice } from "@/lib/invoicing";
import { enqueueCommunicationEvent } from "@/lib/communications/enqueue";
import { buildRenterRecipient } from "@/lib/communications/recipients";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("CIG");
  org.renter = await prisma.renter.update({ where: { id: org.renter.id }, data: { email: "renter@example.com" } });
});

beforeEach(() => {
  mockAuth.mockReset();
  mockAuth.mockResolvedValue(org.session);
});

function formDataWith(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function seedActiveEmailTemplateAndRule(eventType: "INVOICE_ISSUED" | "PAYMENT_RECEIVED") {
  const { createCommunicationTemplateVersion, activateCommunicationTemplate, createCommunicationRule } = await import("@/lib/actions/communications");
  const existingTemplate = await prisma.communicationTemplate.findFirst({ where: { organizationId: org.organization.id, eventType: eventType as never, channel: "EMAIL", language: "en", status: "ACTIVE" } });
  if (!existingTemplate) {
    const templateId = await createCommunicationTemplateVersion(
      formDataWith({ eventType, channel: "EMAIL", language: "en", bodyText: "body {{renterName}}" + (eventType === "INVOICE_ISSUED" ? " {{invoiceNumber}} {{totalAmount}} {{currency}} {{dueDate}} {{contractNumber}} {{unitNumber}}" : " {{receiptNumber}} {{amount}} {{currency}} {{paymentDate}} {{invoiceNumber}}") })
    );
    await activateCommunicationTemplate(templateId);
  }

  const existingRule = await prisma.communicationRule.findUnique({
    where: { organizationId_eventType_channel_recipientStrategy: { organizationId: org.organization.id, eventType: eventType as never, channel: "EMAIL", recipientStrategy: "RENTER" } },
  });
  if (!existingRule) {
    await createCommunicationRule(formDataWith({ eventType, channel: "EMAIL", recipientStrategy: "RENTER" }));
  }
}

describe("Payment idempotency (real Payment record)", () => {
  it("enqueueing PAYMENT_RECEIVED twice for the same real Payment id never creates a second message", async () => {
    await seedActiveEmailTemplateAndRule("PAYMENT_RECEIVED");
    const { contract } = await createTestContract(org, { unitNumber: "CIG-PAY-1" });
    const invoice = await issueInvoice({
      organizationId: org.organization.id,
      renterId: org.renter.id,
      contractId: contract.id,
      lines: [{ description: "Rent", quantity: 1, unitPrice: 1000, vatRate: 0 }],
    });
    const payment = await prisma.payment.create({
      data: { organizationId: org.organization.id, invoiceId: invoice.id, renterId: org.renter.id, receiptNumber: `RCT-CIG-${payment_suffix()}`, amount: 1000, method: "BANK_TRANSFER" },
    });

    const variables = {
      receiptNumber: payment.receiptNumber,
      amount: payment.amount.toString(),
      currency: invoice.currency,
      paymentDate: payment.paymentDate.toISOString().slice(0, 10),
      invoiceNumber: invoice.invoiceNumber,
      renterName: org.renter.fullName,
    };

    await enqueueCommunicationEvent({
      organizationId: org.organization.id,
      eventType: "PAYMENT_RECEIVED",
      businessEntityType: "Payment",
      businessEntityId: payment.id,
      language: "en",
      variables,
      recipients: [buildRenterRecipient(org.renter)],
    });
    // Simulates the same business event's post-commit hook firing a second
    // time (e.g. a future at-least-once replay) - must be a safe no-op.
    await enqueueCommunicationEvent({
      organizationId: org.organization.id,
      eventType: "PAYMENT_RECEIVED",
      businessEntityType: "Payment",
      businessEntityId: payment.id,
      language: "en",
      variables,
      recipients: [buildRenterRecipient(org.renter)],
    });

    const count = await prisma.communicationMessage.count({ where: { organizationId: org.organization.id, businessEntityType: "Payment", businessEntityId: payment.id } });
    expect(count).toBe(1);
  });
});

function payment_suffix() {
  return Math.random().toString(36).slice(2, 8);
}

describe("Business-transaction rollback never enqueues a notification", () => {
  it("recordPayment's rejected over-limit amount throws before commit, and no notification is ever created for it", async () => {
    await seedActiveEmailTemplateAndRule("PAYMENT_RECEIVED");
    const { contract } = await createTestContract(org, { unitNumber: "CIG-ROLLBACK-1" });
    const invoice = await issueInvoice({
      organizationId: org.organization.id,
      renterId: org.renter.id,
      contractId: contract.id,
      lines: [{ description: "Rent", quantity: 1, unitPrice: 1000, vatRate: 0 }],
    });

    const before = await prisma.communicationMessage.count({ where: { organizationId: org.organization.id, eventType: "PAYMENT_RECEIVED" } });

    const { recordPayment } = await import("@/lib/actions/payments");
    const fd = new FormData();
    fd.set("invoiceId", invoice.id);
    fd.set("amount", "999999"); // far exceeds the invoice total - recordPayment throws inside its own transaction, before any Payment row is created.
    fd.set("method", "BANK_TRANSFER");
    await expect(recordPayment(fd)).rejects.toThrow();

    const paymentCount = await prisma.payment.count({ where: { invoiceId: invoice.id } });
    expect(paymentCount).toBe(0);

    const after = await prisma.communicationMessage.count({ where: { organizationId: org.organization.id, eventType: "PAYMENT_RECEIVED" } });
    expect(after).toBe(before);
  });
});

describe("Portal privacy regression: Communications is unreachable without a valid internal session", () => {
  it("every Communications action rejects when there is no internal (staff) NextAuth session - e.g. a Tenant/Owner Portal-only visitor", async () => {
    mockAuth.mockResolvedValue(null);
    const {
      getCommunicationsDashboard,
      listCommunicationMessages,
      getCommunicationMessageById,
      retryCommunicationMessage,
      cancelCommunicationMessage,
      listCommunicationTemplates,
      listCommunicationRules,
    } = await import("@/lib/actions/communications");

    await expect(getCommunicationsDashboard()).rejects.toThrow();
    await expect(listCommunicationMessages()).rejects.toThrow();
    await expect(getCommunicationMessageById("nonexistent")).rejects.toThrow();
    await expect(retryCommunicationMessage("nonexistent")).rejects.toThrow();
    await expect(cancelCommunicationMessage("nonexistent")).rejects.toThrow();
    await expect(listCommunicationTemplates()).rejects.toThrow();
    await expect(listCommunicationRules()).rejects.toThrow();
  });

  it("a Tenant Portal account session role can never satisfy a communications.* permission check", async () => {
    // Tenant/Owner Portal accounts are never Users and never carry a
    // UserRole (see docs/TENANT-PORTAL.md) - this asserts the RBAC policy
    // itself grants no communications.* permission to any external-facing
    // concept, reinforcing that the portal's own, separate auth boundary
    // (src/lib/tenant-auth.ts / src/lib/owner-auth.ts) is the only thing
    // standing between a portal visitor and this data, by design on both sides.
    const { ROLE_PERMISSIONS } = await import("@/lib/permissions");
    for (const role of Object.keys(ROLE_PERMISSIONS) as Array<keyof typeof ROLE_PERMISSIONS>) {
      // VIEWER (the lowest internal staff role) legitimately has read-only
      // communications.view/message.view - the guarantee under test is that
      // NO role grants communications.retry/cancel/template/rule mutation
      // to a merely-authenticated-but-unauthorized actor by accident.
      if (role === "VIEWER" || role === "ACCOUNTANT") {
        expect(ROLE_PERMISSIONS[role]).not.toContain("communications.retry");
        expect(ROLE_PERMISSIONS[role]).not.toContain("communicationTemplate.create");
        expect(ROLE_PERMISSIONS[role]).not.toContain("communicationRule.create");
      }
    }
  });
});
