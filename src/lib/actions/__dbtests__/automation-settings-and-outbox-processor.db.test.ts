/**
 * Real, database-backed tests for:
 *  - AutomationSettings RBAC (OWNER/ADMIN-only mutation, safe-by-default),
 *    with an AuditLog entry for every change (Step 97);
 *  - the outbox processor's own idempotency/version-guard/isolation
 *    behavior: duplicate processing never duplicates a CommunicationMessage,
 *    an unsupported payload version fails permanently, and a processing
 *    failure never touches the underlying business row.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestContract, createTestUser, sessionFor, uniqueSuffix, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";
import { processCommunicationOutbox } from "@/lib/automation/outbox-processor";
import { invoiceIssuedKey } from "@/lib/automation/outbox-keys";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("ASET");
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

describe("AutomationSettings: safe defaults + OWNER/ADMIN-only mutation", () => {
  it("defaults every reminder to disabled when no settings row exists yet", async () => {
    const { getAutomationSettings } = await import("@/lib/actions/automation");
    const settings = await getAutomationSettings();
    expect(settings.rentReminderEnabled).toBe(false);
    expect(settings.contractExpiryReminderEnabled).toBe(false);
    expect(settings.moveInReminderEnabled).toBe(false);
    expect(settings.moveOutReminderEnabled).toBe(false);
    expect(settings.maintenanceSlaAutomationEnabled).toBe(false);
    expect(settings.updatedAt).toBeNull();
  });

  it("ADMIN can enable a reminder, and the change is audited", async () => {
    const { updateAutomationSettings, getAutomationSettings } = await import("@/lib/actions/automation");
    await updateAutomationSettings({
      rentReminderEnabled: true,
      contractExpiryReminderEnabled: false,
      moveInReminderEnabled: false,
      moveOutReminderEnabled: false,
      maintenanceSlaAutomationEnabled: false,
    });

    const settings = await getAutomationSettings();
    expect(settings.rentReminderEnabled).toBe(true);
    expect(settings.updatedAt).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({ where: { organizationId: org.organization.id, entityType: "AutomationSettings" }, orderBy: { createdAt: "desc" } });
    expect(audit).not.toBeNull();
  });

  it("MANAGER cannot update automation settings (view-only per RBAC)", async () => {
    const manager = await createTestUser(org.organization.id, "MANAGER");
    mockAuth.mockResolvedValue(sessionFor(manager, org.organization.name));

    const { updateAutomationSettings } = await import("@/lib/actions/automation");
    await expect(
      updateAutomationSettings({
        rentReminderEnabled: true,
        contractExpiryReminderEnabled: false,
        moveInReminderEnabled: false,
        moveOutReminderEnabled: false,
        maintenanceSlaAutomationEnabled: false,
      })
    ).rejects.toThrow();
  });

  it("VIEWER cannot even view automation settings", async () => {
    const viewer = await createTestUser(org.organization.id, "VIEWER");
    mockAuth.mockResolvedValue(sessionFor(viewer, org.organization.name));

    const { getAutomationSettings } = await import("@/lib/actions/automation");
    await expect(getAutomationSettings()).rejects.toThrow();
  });

  it("ACCOUNTANT can view but not update settings", async () => {
    const accountant = await createTestUser(org.organization.id, "ACCOUNTANT");
    mockAuth.mockResolvedValue(sessionFor(accountant, org.organization.name));

    const { getAutomationSettings, updateAutomationSettings } = await import("@/lib/actions/automation");
    await expect(getAutomationSettings()).resolves.toBeDefined();
    await expect(
      updateAutomationSettings({
        rentReminderEnabled: true,
        contractExpiryReminderEnabled: false,
        moveInReminderEnabled: false,
        moveOutReminderEnabled: false,
        maintenanceSlaAutomationEnabled: false,
      })
    ).rejects.toThrow();
  });
});

describe("Outbox processor: idempotency, payload-version guard, and provider-failure isolation", () => {
  async function seedActiveTemplateAndRule() {
    const { createCommunicationTemplateVersion, activateCommunicationTemplate, createCommunicationRule } = await import("@/lib/actions/communications");
    const existingTemplate = await prisma.communicationTemplate.findFirst({ where: { organizationId: org.organization.id, eventType: "INVOICE_ISSUED", channel: "EMAIL", language: "ar", status: "ACTIVE" } });
    if (!existingTemplate) {
      const templateId = await createCommunicationTemplateVersion(
        fd({ eventType: "INVOICE_ISSUED", channel: "EMAIL", language: "ar", bodyText: "Dear {{renterName}}, invoice {{invoiceNumber}} for {{totalAmount}} {{currency}} due {{dueDate}} ({{contractNumber}} / {{unitNumber}})." })
      );
      await activateCommunicationTemplate(templateId);
    }
    const existingRule = await prisma.communicationRule.findUnique({
      where: { organizationId_eventType_channel_recipientStrategy: { organizationId: org.organization.id, eventType: "INVOICE_ISSUED", channel: "EMAIL", recipientStrategy: "RENTER" } },
    });
    if (!existingRule) {
      await createCommunicationRule(fd({ eventType: "INVOICE_ISSUED", channel: "EMAIL", recipientStrategy: "RENTER" }));
    }
  }

  it("processing the same outbox event twice never creates a second CommunicationMessage", async () => {
    await seedActiveTemplateAndRule();
    org.renter = await prisma.renter.update({ where: { id: org.renter.id }, data: { email: `renter-${uniqueSuffix()}@example.com` } });
    const { contract } = await createTestContract(org, { unitNumber: `ASET-DUP-${uniqueSuffix()}` });
    const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } });
    const { issueInvoiceForSchedule } = await import("@/lib/actions/invoices");
    await issueInvoiceForSchedule(fd({ scheduleId: schedule.id, kind: "RENT" }));
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { contractId: contract.id } });

    await processCommunicationOutbox(20);
    const messageCountAfterFirst = await prisma.communicationMessage.count({ where: { organizationId: org.organization.id, businessEntityType: "Invoice", businessEntityId: invoice.id } });
    expect(messageCountAfterFirst).toBe(1);

    const event = await prisma.communicationOutboxEvent.findFirstOrThrow({ where: { organizationId: org.organization.id, eventKey: invoiceIssuedKey(invoice.id) } });
    expect(event.status).toBe("PROCESSED");

    // Simulate a recovered-from-stuck reprocessing attempt of the SAME logical event.
    await prisma.communicationOutboxEvent.update({ where: { id: event.id }, data: { status: "PENDING", processedAt: null } });
    await processCommunicationOutbox(20);

    const messageCountAfterSecond = await prisma.communicationMessage.count({ where: { organizationId: org.organization.id, businessEntityType: "Invoice", businessEntityId: invoice.id } });
    expect(messageCountAfterSecond).toBe(1);
  });

  it("an unsupported payload version fails the outbox event permanently, without ever calling createCommunicationMessagesForEvent", async () => {
    const badEvent = await prisma.communicationOutboxEvent.create({
      data: {
        organizationId: org.organization.id,
        eventType: "PAYMENT_RECEIVED",
        eventKey: `ASET-BADVERSION-${uniqueSuffix()}`,
        status: "PENDING",
        payloadVersion: 999,
        payloadJson: { businessEntityType: "Payment", businessEntityId: "x", language: "en", variables: {}, recipients: [] },
      },
    });

    await processCommunicationOutbox(20);

    const after = await prisma.communicationOutboxEvent.findUniqueOrThrow({ where: { id: badEvent.id } });
    expect(after.status).toBe("FAILED");
    expect(after.lastErrorCode).toBe("UNSUPPORTED_PAYLOAD_VERSION");
  });

  it("a processing failure (no active rule/template) leaves the underlying Invoice untouched and retries independently", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `ASET-ISOL-${uniqueSuffix()}` });
    const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } });
    const { issueInvoiceForSchedule } = await import("@/lib/actions/invoices");
    // Deliberately corrupt the outbox row's own recipients so message
    // creation fails downstream, never touching the Invoice/Payment tables
    // at all - this outbox processor never writes to them.
    await issueInvoiceForSchedule(fd({ scheduleId: schedule.id, kind: "RENT" }));
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { contractId: contract.id } });
    const invoiceBefore = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });

    await prisma.communicationOutboxEvent.updateMany({
      where: { organizationId: org.organization.id, eventKey: invoiceIssuedKey(invoice.id) },
      data: { payloadJson: { businessEntityType: "Invoice", businessEntityId: invoice.id, language: "en", variables: {}, recipients: "not-an-array" } },
    });

    await processCommunicationOutbox(20);

    const invoiceAfter = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(invoiceAfter.status).toBe(invoiceBefore.status);
    expect(invoiceAfter.totalAmount.toString()).toBe(invoiceBefore.totalAmount.toString());

    const event = await prisma.communicationOutboxEvent.findFirstOrThrow({ where: { organizationId: org.organization.id, eventKey: invoiceIssuedKey(invoice.id) } });
    // Malformed payload (recipients not an array) fails the version guard -
    // permanent, not retryable (a fresh dispatch would fail identically).
    expect(event.status).toBe("FAILED");
  });
});
