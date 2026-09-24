/**
 * Real, database-backed cross-organization security and IDOR tests for
 * Notifications & Communications: two real seeded organizations, only the
 * NextAuth session boundary mocked - the exact pattern established by
 * maintenance-cross-org-security.db.test.ts.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";
import { enqueueCommunicationEvent } from "@/lib/communications/enqueue";
import { buildRenterRecipient } from "@/lib/communications/recipients";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let orgA: SeededOrg;
let orgB: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  orgA = await seedFullOrg("CSA");
  orgB = await seedFullOrg("CSB");
  orgA.renter = await prisma.renter.update({ where: { id: orgA.renter.id }, data: { email: "renterA@example.com" } });
  orgB.renter = await prisma.renter.update({ where: { id: orgB.renter.id }, data: { email: "renterB@example.com" } });
});

beforeEach(() => {
  mockAuth.mockReset();
});

function formDataWith(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function seedTemplateRuleAndMessage(org: SeededOrg, businessEntityId: string) {
  mockAuth.mockResolvedValue(org.session);
  const { createCommunicationTemplateVersion, activateCommunicationTemplate, createCommunicationRule } = await import("@/lib/actions/communications");

  let templateId = (
    await prisma.communicationTemplate.findFirst({ where: { organizationId: org.organization.id, eventType: "INVOICE_ISSUED", channel: "EMAIL", language: "en", status: "ACTIVE" } })
  )?.id;
  if (!templateId) {
    templateId = await createCommunicationTemplateVersion(
      formDataWith({ eventType: "INVOICE_ISSUED", channel: "EMAIL", language: "en", bodyText: "{{invoiceNumber}} {{totalAmount}} {{currency}} {{dueDate}} {{contractNumber}} {{unitNumber}} {{renterName}}" })
    );
    await activateCommunicationTemplate(templateId);
  }

  let ruleId = (
    await prisma.communicationRule.findUnique({
      where: { organizationId_eventType_channel_recipientStrategy: { organizationId: org.organization.id, eventType: "INVOICE_ISSUED", channel: "EMAIL", recipientStrategy: "RENTER" } },
    })
  )?.id;
  if (!ruleId) {
    ruleId = await createCommunicationRule(formDataWith({ eventType: "INVOICE_ISSUED", channel: "EMAIL", recipientStrategy: "RENTER" }));
  }

  await enqueueCommunicationEvent({
    organizationId: org.organization.id,
    eventType: "INVOICE_ISSUED",
    businessEntityType: "Invoice",
    businessEntityId,
    language: "en",
    variables: {
      invoiceNumber: "INV-XORG-1",
      totalAmount: "100",
      currency: "SAR",
      dueDate: "2027-01-01",
      contractNumber: "CTR-XORG-1",
      unitNumber: org.unit.unitNumber,
      renterName: org.renter.fullName,
    },
    recipients: [buildRenterRecipient(org.renter)],
  });
  const message = await prisma.communicationMessage.findFirstOrThrow({ where: { organizationId: org.organization.id, businessEntityId } });
  return { templateId, ruleId, messageId: message.id };
}

describe("Communications cross-organization isolation - Templates", () => {
  it("Org A cannot read or activate Org B's template", async () => {
    const { templateId } = await seedTemplateRuleAndMessage(orgB, "xorg-invoice-1");

    mockAuth.mockResolvedValue(orgA.session);
    const { getCommunicationTemplateById, activateCommunicationTemplate } = await import("@/lib/actions/communications");
    await expect(getCommunicationTemplateById(templateId)).rejects.toThrow();
    await expect(activateCommunicationTemplate(templateId)).rejects.toThrow();

    const stillOrgBs = await prisma.communicationTemplate.findUniqueOrThrow({ where: { id: templateId } });
    expect(stillOrgBs.organizationId).toBe(orgB.organization.id);
  });

  it("listCommunicationTemplates never returns another organization's rows", async () => {
    mockAuth.mockResolvedValue(orgA.session);
    const { listCommunicationTemplates } = await import("@/lib/actions/communications");
    const templates = await listCommunicationTemplates();
    expect(templates.every((t) => t.organizationId === orgA.organization.id)).toBe(true);
  });
});

describe("Communications cross-organization isolation - Rules", () => {
  it("listCommunicationRules never returns another organization's rows", async () => {
    mockAuth.mockResolvedValue(orgB.session);
    const { listCommunicationRules } = await import("@/lib/actions/communications");
    const rules = await listCommunicationRules();
    expect(rules.every((r) => r.organizationId === orgB.organization.id)).toBe(true);
  });
});

describe("Communications cross-organization isolation - Messages", () => {
  it("Org A cannot read, retry, or cancel Org B's message", async () => {
    const { messageId } = await seedTemplateRuleAndMessage(orgB, "xorg-invoice-2");

    mockAuth.mockResolvedValue(orgA.session);
    const { getCommunicationMessageById, retryCommunicationMessage, cancelCommunicationMessage } = await import("@/lib/actions/communications");
    await expect(getCommunicationMessageById(messageId)).rejects.toThrow();
    await expect(retryCommunicationMessage(messageId)).rejects.toThrow();
    await expect(cancelCommunicationMessage(messageId)).rejects.toThrow();

    const stillOrgBs = await prisma.communicationMessage.findUniqueOrThrow({ where: { id: messageId } });
    expect(stillOrgBs.organizationId).toBe(orgB.organization.id);
    expect(stillOrgBs.status).toBe("QUEUED");
  });

  it("listCommunicationMessages never returns another organization's rows", async () => {
    await seedTemplateRuleAndMessage(orgA, "xorg-invoice-2b");

    mockAuth.mockResolvedValue(orgA.session);
    const { listCommunicationMessages } = await import("@/lib/actions/communications");
    const messages = await listCommunicationMessages();
    expect(messages.length).toBeGreaterThan(0);

    const rawMessages = await prisma.communicationMessage.findMany({ where: { id: { in: messages.map((m) => m.id) } } });
    expect(rawMessages.every((m) => m.organizationId === orgA.organization.id)).toBe(true);
  });

  it("getCommunicationMessageById never exposes the raw destination, even for the owning organization", async () => {
    const { messageId } = await seedTemplateRuleAndMessage(orgA, "xorg-invoice-3");
    mockAuth.mockResolvedValue(orgA.session);
    const { getCommunicationMessageById } = await import("@/lib/actions/communications");
    const message = await getCommunicationMessageById(messageId);
    expect(message).not.toHaveProperty("destinationRaw");
    expect(message.destinationMasked).not.toBe("renterA@example.com");
  });
});
