/**
 * The mandatory concurrency test: two workers racing for the same queued
 * CommunicationMessage must result in exactly one send (Critical Principle
 * 3/5). Proves processQueuedCommunications()'s conditional
 * `updateMany({ where: { status: "QUEUED" } })` claim is genuinely
 * race-safe under real concurrent DB access, not just single-threaded JS
 * interleaving.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";
import { enqueueCommunicationEvent } from "@/lib/communications/enqueue";
import { buildRenterRecipient } from "@/lib/communications/recipients";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("CCX");
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

async function seedOneQueuedMessage(businessEntityId: string) {
  const { createCommunicationTemplateVersion, activateCommunicationTemplate, createCommunicationRule } = await import("@/lib/actions/communications");

  const existingTemplate = await prisma.communicationTemplate.findFirst({
    where: { organizationId: org.organization.id, eventType: "INVOICE_ISSUED", channel: "EMAIL", language: "en", status: "ACTIVE" },
  });
  if (!existingTemplate) {
    const templateId = await createCommunicationTemplateVersion(
      formDataWith({ eventType: "INVOICE_ISSUED", channel: "EMAIL", language: "en", bodyText: "{{invoiceNumber}} {{totalAmount}} {{currency}} {{dueDate}} {{contractNumber}} {{unitNumber}} {{renterName}}" })
    );
    await activateCommunicationTemplate(templateId);
  }

  const existingRule = await prisma.communicationRule.findUnique({
    where: { organizationId_eventType_channel_recipientStrategy: { organizationId: org.organization.id, eventType: "INVOICE_ISSUED", channel: "EMAIL", recipientStrategy: "RENTER" } },
  });
  if (!existingRule) {
    await createCommunicationRule(formDataWith({ eventType: "INVOICE_ISSUED", channel: "EMAIL", recipientStrategy: "RENTER" }));
  }

  await enqueueCommunicationEvent({
    organizationId: org.organization.id,
    eventType: "INVOICE_ISSUED",
    businessEntityType: "Invoice",
    businessEntityId,
    language: "en",
    variables: {
      invoiceNumber: "INV-CONC-1",
      totalAmount: "100",
      currency: "SAR",
      dueDate: "2027-01-01",
      contractNumber: "CTR-CONC-1",
      unitNumber: org.unit.unitNumber,
      renterName: org.renter.fullName,
    },
    recipients: [buildRenterRecipient(org.renter)],
  });

  return prisma.communicationMessage.findFirstOrThrow({ where: { organizationId: org.organization.id, businessEntityId } });
}

describe("processQueuedCommunications concurrency", () => {
  it("exactly one of two concurrent processor runs sends a given message", async () => {
    const { processQueuedCommunications } = await import("@/lib/communications/processor");
    const message = await seedOneQueuedMessage("test-invoice-concurrency-1");

    const [resultA, resultB] = await Promise.all([processQueuedCommunications(10), processQueuedCommunications(10)]);

    // Between the two concurrent runs, this message was claimed exactly once.
    expect(resultA.claimed + resultB.claimed).toBe(1);

    const attempts = await prisma.communicationDeliveryAttempt.findMany({ where: { messageId: message.id } });
    expect(attempts).toHaveLength(1);

    const finalMessage = await prisma.communicationMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(finalMessage.status).toBe("SENT");
    expect(finalMessage.attemptCount).toBe(1);
  });

  it("a message already claimed by one run cannot be claimed again by a later run", async () => {
    const { processQueuedCommunications } = await import("@/lib/communications/processor");
    const message = await seedOneQueuedMessage("test-invoice-concurrency-2");

    await processQueuedCommunications(10);
    const afterFirst = await prisma.communicationMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(afterFirst.status).toBe("SENT");

    // A second run must not re-claim/re-send an already-SENT message.
    const second = await processQueuedCommunications(10);
    expect(second.claimed).toBe(0);
    const attempts = await prisma.communicationDeliveryAttempt.findMany({ where: { messageId: message.id } });
    expect(attempts).toHaveLength(1);
  });
});
