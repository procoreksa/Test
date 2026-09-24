/**
 * Real, database-backed lifecycle tests for Notifications & Communications
 * (docs/NOTIFICATIONS-COMMUNICATIONS.md): template versioning/activation,
 * rule creation, event enqueue + rendering, idempotent duplicate enqueue,
 * multi-channel fan-out, and recipient-resolution correctness. Only the
 * NextAuth session boundary is mocked - the exact pattern established by
 * maintenance-cross-org-security.db.test.ts.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";
import { enqueueCommunicationEvent } from "@/lib/communications/enqueue";
import { buildRenterRecipient, buildOwnerRecipient } from "@/lib/communications/recipients";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("CLA");
  org.renter = await prisma.renter.update({ where: { id: org.renter.id }, data: { email: "renter@example.com", phone: "0501234567" } });
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

async function createAndActivateTemplate(overrides: Partial<{ eventType: string; channel: string; language: string; bodyText: string; subject: string }> = {}) {
  const { createCommunicationTemplateVersion, activateCommunicationTemplate } = await import("@/lib/actions/communications");
  const id = await createCommunicationTemplateVersion(
    formDataWith({
      eventType: overrides.eventType ?? "INVOICE_ISSUED",
      channel: overrides.channel ?? "EMAIL",
      language: overrides.language ?? "en",
      subject: overrides.subject ?? "Notification",
      bodyText: overrides.bodyText ?? "Dear {{renterName}}, invoice {{invoiceNumber}} for {{totalAmount}} {{currency}} due {{dueDate}} ({{contractNumber}} / {{unitNumber}}).",
    })
  );
  await activateCommunicationTemplate(id);
  return id;
}

describe("Communication Template versioning & activation", () => {
  it("creates a DRAFT v1 template, then activates it", async () => {
    const { getCommunicationTemplateById } = await import("@/lib/actions/communications");
    const id = await createAndActivateTemplate({ eventType: "MAINTENANCE_REQUEST_CREATED", bodyText: "Request {{requestNumber}}: {{title}} ({{category}}/{{priority}}) at {{unitNumber}}" });
    const { template } = await getCommunicationTemplateById(id);
    expect(template.version).toBe(1);
    expect(template.status).toBe("ACTIVE");
  });

  it("activating a new version archives the previously ACTIVE version for the same key", async () => {
    const { createCommunicationTemplateVersion, activateCommunicationTemplate, getCommunicationTemplateById } = await import("@/lib/actions/communications");
    const v1 = await createAndActivateTemplate({ eventType: "PAYMENT_RECEIVED", bodyText: "v1 {{receiptNumber}} {{amount}} {{currency}} {{paymentDate}} {{invoiceNumber}} {{renterName}}" });
    const v2Id = await createCommunicationTemplateVersion(
      formDataWith({
        eventType: "PAYMENT_RECEIVED",
        channel: "EMAIL",
        language: "en",
        bodyText: "v2 {{receiptNumber}} {{amount}} {{currency}} {{paymentDate}} {{invoiceNumber}} {{renterName}}",
      })
    );
    await activateCommunicationTemplate(v2Id);

    const { template: v1After } = await getCommunicationTemplateById(v1);
    const { template: v2After } = await getCommunicationTemplateById(v2Id);
    expect(v1After.status).toBe("ARCHIVED");
    expect(v2After.status).toBe("ACTIVE");
    expect(v2After.version).toBe(2);
  });

  it("rejects a template body referencing a variable outside the event's allow-list", async () => {
    const { createCommunicationTemplateVersion } = await import("@/lib/actions/communications");
    await expect(
      createCommunicationTemplateVersion(
        formDataWith({ eventType: "INVOICE_ISSUED", channel: "EMAIL", language: "fr", bodyText: "Leaking {{someSecretField}}" })
      )
    ).rejects.toThrow();
  });
});

describe("Communication Rule creation", () => {
  it("creates an enabled rule and rejects a duplicate (event, channel, strategy)", async () => {
    const { createCommunicationRule } = await import("@/lib/actions/communications");
    await createCommunicationRule(formDataWith({ eventType: "MOVE_IN_SCHEDULED", channel: "EMAIL", recipientStrategy: "RENTER" }));
    await expect(createCommunicationRule(formDataWith({ eventType: "MOVE_IN_SCHEDULED", channel: "EMAIL", recipientStrategy: "RENTER" }))).rejects.toThrow();
  });

  it("setCommunicationRuleEnabled toggles isEnabled", async () => {
    const { createCommunicationRule, setCommunicationRuleEnabled, listCommunicationRules } = await import("@/lib/actions/communications");
    const ruleId = await createCommunicationRule(formDataWith({ eventType: "MOVE_OUT_SCHEDULED", channel: "EMAIL", recipientStrategy: "RENTER" }));
    await setCommunicationRuleEnabled(ruleId, false);
    const rules = await listCommunicationRules();
    expect(rules.find((r) => r.id === ruleId)?.isEnabled).toBe(false);
  });
});

describe("enqueueCommunicationEvent", () => {
  it("renders the active template and creates a QUEUED message with a masked destination", async () => {
    const { createCommunicationRule } = await import("@/lib/actions/communications");
    await createAndActivateTemplate({ eventType: "INVOICE_ISSUED" });
    await createCommunicationRule(formDataWith({ eventType: "INVOICE_ISSUED", channel: "EMAIL", recipientStrategy: "RENTER" }));

    await enqueueCommunicationEvent({
      organizationId: org.organization.id,
      eventType: "INVOICE_ISSUED",
      businessEntityType: "Invoice",
      businessEntityId: "test-invoice-lifecycle-1",
      language: "en",
      variables: {
        invoiceNumber: "INV-2027-000001",
        totalAmount: "1000.00",
        currency: "SAR",
        dueDate: "2027-02-01",
        contractNumber: "CTR-2027-00001",
        unitNumber: org.unit.unitNumber,
        renterName: org.renter.fullName,
      },
      recipients: [buildRenterRecipient(org.renter)],
    });

    const message = await prisma.communicationMessage.findFirstOrThrow({
      where: { organizationId: org.organization.id, businessEntityType: "Invoice", businessEntityId: "test-invoice-lifecycle-1" },
    });
    expect(message.status).toBe("QUEUED");
    expect(message.channel).toBe("EMAIL");
    expect(message.recipientType).toBe("RENTER");
    expect(message.renterId).toBe(org.renter.id);
    expect(message.renderedBody).toContain("INV-2027-000001");
    expect(message.destinationRaw).toBe("renter@example.com");
    expect(message.destinationMasked).not.toBe("renter@example.com");
    expect(message.destinationMasked).toContain("@example.com");
  });

  it("is idempotent: retrying the same event/business record/channel/recipient never creates a duplicate message", async () => {
    const params = {
      organizationId: org.organization.id,
      eventType: "INVOICE_ISSUED" as const,
      businessEntityType: "Invoice",
      businessEntityId: "test-invoice-lifecycle-idempotent",
      language: "en" as const,
      variables: {
        invoiceNumber: "INV-2027-000002",
        totalAmount: "500.00",
        currency: "SAR",
        dueDate: "2027-03-01",
        contractNumber: "CTR-2027-00002",
        unitNumber: org.unit.unitNumber,
        renterName: org.renter.fullName,
      },
      recipients: [buildRenterRecipient(org.renter)],
    };

    await enqueueCommunicationEvent(params);
    await enqueueCommunicationEvent(params);
    await enqueueCommunicationEvent(params);

    const count = await prisma.communicationMessage.count({
      where: { organizationId: org.organization.id, businessEntityType: "Invoice", businessEntityId: "test-invoice-lifecycle-idempotent" },
    });
    expect(count).toBe(1);
  });

  it("fans out to every enabled channel with a matching rule and candidate", async () => {
    const { createCommunicationRule } = await import("@/lib/actions/communications");
    await createAndActivateTemplate({ eventType: "SECURITY_DEPOSIT_SETTLEMENT_POSTED", bodyText: "{{settlementNumber}} {{refundDue}} {{additionalDue}} {{currency}} {{unitNumber}}" });
    await createAndActivateTemplate({
      eventType: "SECURITY_DEPOSIT_SETTLEMENT_POSTED",
      channel: "WHATSAPP",
      bodyText: "{{settlementNumber}} {{refundDue}} {{additionalDue}} {{currency}} {{unitNumber}}",
    });
    await createCommunicationRule(formDataWith({ eventType: "SECURITY_DEPOSIT_SETTLEMENT_POSTED", channel: "EMAIL", recipientStrategy: "RENTER" }));
    await createCommunicationRule(formDataWith({ eventType: "SECURITY_DEPOSIT_SETTLEMENT_POSTED", channel: "WHATSAPP", recipientStrategy: "RENTER" }));

    await enqueueCommunicationEvent({
      organizationId: org.organization.id,
      eventType: "SECURITY_DEPOSIT_SETTLEMENT_POSTED",
      businessEntityType: "SecurityDepositSettlement",
      businessEntityId: "test-settlement-multichannel",
      language: "en",
      variables: { settlementNumber: "SDS-000001", refundDue: "0", additionalDue: "0", currency: "SAR", unitNumber: org.unit.unitNumber },
      recipients: [buildRenterRecipient(org.renter)],
    });

    const messages = await prisma.communicationMessage.findMany({
      where: { organizationId: org.organization.id, businessEntityType: "SecurityDepositSettlement", businessEntityId: "test-settlement-multichannel" },
    });
    expect(messages.map((m) => m.channel).sort()).toEqual(["EMAIL", "WHATSAPP"]);
    // Phone-based destination is E.164-formatted, never the raw stored format.
    const whatsapp = messages.find((m) => m.channel === "WHATSAPP")!;
    expect(whatsapp.destinationRaw).toBe("+966501234567");
  });

  it("does not produce a message for a rule whose recipient strategy has no matching candidate supplied", async () => {
    const { createCommunicationRule } = await import("@/lib/actions/communications");
    await createAndActivateTemplate({ eventType: "MAINTENANCE_COMPLETED", bodyText: "{{requestNumber}} {{workOrderNumber}} {{completedDate}} {{unitNumber}}" });
    await createCommunicationRule(formDataWith({ eventType: "MAINTENANCE_COMPLETED", channel: "EMAIL", recipientStrategy: "OWNER" }));

    await enqueueCommunicationEvent({
      organizationId: org.organization.id,
      eventType: "MAINTENANCE_COMPLETED",
      businessEntityType: "MaintenanceWorkOrder",
      businessEntityId: "test-wo-no-owner-candidate",
      language: "en",
      variables: { requestNumber: "MR-000001", workOrderNumber: "WO-000001", completedDate: "2027-01-01", unitNumber: org.unit.unitNumber },
      // Only a RENTER candidate offered - the OWNER-strategy rule has nothing to match.
      recipients: [buildRenterRecipient(org.renter)],
    });

    const count = await prisma.communicationMessage.count({
      where: { organizationId: org.organization.id, businessEntityType: "MaintenanceWorkOrder", businessEntityId: "test-wo-no-owner-candidate" },
    });
    expect(count).toBe(0);
  });

  it("produces a message when an OWNER candidate IS supplied and matched by an OWNER-strategy rule on a wired event", async () => {
    await prisma.owner.update({ where: { id: org.owner.id }, data: { email: "owner@example.com" } });
    const { createCommunicationRule } = await import("@/lib/actions/communications");
    // MAINTENANCE_REQUEST_CREATED is wired (Critical Principle 6/no-auto-
    // enable events would otherwise silently no-op); its default seeded
    // rule uses RENTER, but nothing stops an OWNER-strategy rule from also
    // being configured for it - this proves that generic path works.
    await createAndActivateTemplate({ eventType: "MAINTENANCE_REQUEST_CREATED", bodyText: "{{requestNumber}} {{title}} {{category}} {{priority}} {{unitNumber}}" });
    await createCommunicationRule(formDataWith({ eventType: "MAINTENANCE_REQUEST_CREATED", channel: "EMAIL", recipientStrategy: "OWNER" }));

    await enqueueCommunicationEvent({
      organizationId: org.organization.id,
      eventType: "MAINTENANCE_REQUEST_CREATED",
      businessEntityType: "MaintenanceRequest",
      businessEntityId: "test-request-owner-candidate",
      language: "en",
      variables: { requestNumber: "MR-000099", title: "Leaking pipe", category: "PLUMBING", priority: "NORMAL", unitNumber: org.unit.unitNumber },
      recipients: [buildOwnerRecipient(await prisma.owner.findUniqueOrThrow({ where: { id: org.owner.id } }))],
    });

    const message = await prisma.communicationMessage.findFirstOrThrow({
      where: { organizationId: org.organization.id, businessEntityType: "MaintenanceRequest", businessEntityId: "test-request-owner-candidate" },
    });
    expect(message.recipientType).toBe("OWNER");
    expect(message.ownerId).toBe(org.owner.id);
  });
});
