/**
 * Real, database-backed tests for retry policy, failure classification,
 * manual retry/cancel, append-only delivery history, and provider-failure
 * isolation (docs/NOTIFICATIONS-COMMUNICATIONS.md, "Retry policy").
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";
import { enqueueCommunicationEvent } from "@/lib/communications/enqueue";
import { buildRenterRecipient } from "@/lib/communications/recipients";
import { MOCK_PERMANENT_FAILURE_MARKER, MOCK_RETRYABLE_FAILURE_MARKER } from "@/lib/communications/providers/mock";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("CRF");
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

async function seedActiveTemplateAndRule(eventType = "INVOICE_ISSUED") {
  mockAuth.mockResolvedValue(org.session);
  const { createCommunicationTemplateVersion, activateCommunicationTemplate, createCommunicationRule } = await import("@/lib/actions/communications");
  const existingRule = await prisma.communicationRule.findFirst({ where: { organizationId: org.organization.id, eventType: eventType as never, channel: "EMAIL", recipientStrategy: "RENTER" } });
  if (!existingRule) {
    await createCommunicationRule(formDataWith({ eventType, channel: "EMAIL", recipientStrategy: "RENTER" }));
  }
  const existingTemplate = await prisma.communicationTemplate.findFirst({ where: { organizationId: org.organization.id, eventType: eventType as never, channel: "EMAIL", language: "en", status: "ACTIVE" } });
  if (existingTemplate) return;
  const templateId = await createCommunicationTemplateVersion(
    formDataWith({ eventType, channel: "EMAIL", language: "en", bodyText: "{{invoiceNumber}} {{totalAmount}} {{currency}} {{dueDate}} {{contractNumber}} {{unitNumber}} {{renterName}}" })
  );
  await activateCommunicationTemplate(templateId);
}

async function enqueueForEmail(businessEntityId: string, email: string) {
  await prisma.renter.update({ where: { id: org.renter.id }, data: { email } });
  await enqueueCommunicationEvent({
    organizationId: org.organization.id,
    eventType: "INVOICE_ISSUED",
    businessEntityType: "Invoice",
    businessEntityId,
    language: "en",
    variables: {
      invoiceNumber: "INV-RF-1",
      totalAmount: "100",
      currency: "SAR",
      dueDate: "2027-01-01",
      contractNumber: "CTR-RF-1",
      unitNumber: org.unit.unitNumber,
      renterName: org.renter.fullName,
    },
    recipients: [buildRenterRecipient({ ...org.renter, email })],
  });
  return prisma.communicationMessage.findFirstOrThrow({ where: { organizationId: org.organization.id, businessEntityId } });
}

describe("Retry policy: retryable vs permanent failure", () => {
  beforeAll(async () => {
    await seedActiveTemplateAndRule();
  });

  it("a retryable provider failure requeues the message with attemptCount incremented and a recorded FAILED attempt", async () => {
    const { processQueuedCommunications } = await import("@/lib/communications/processor");
    const message = await enqueueForEmail("test-invoice-retryable", `renter+${MOCK_RETRYABLE_FAILURE_MARKER}@example.com`);

    await processQueuedCommunications(10);

    const after = await prisma.communicationMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(after.status).toBe("QUEUED");
    expect(after.attemptCount).toBe(1);
    expect(after.nextAttemptAt).not.toBeNull();
    expect(after.lastErrorCode).toBe("PROVIDER_TIMEOUT");

    const attempts = await prisma.communicationDeliveryAttempt.findMany({ where: { messageId: message.id } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].status).toBe("FAILED");
  });

  it("repeated retryable failures stop at maxAttempts and the message becomes permanently FAILED", async () => {
    const { processQueuedCommunications } = await import("@/lib/communications/processor");
    const message = await enqueueForEmail("test-invoice-max-attempts", `renter+${MOCK_RETRYABLE_FAILURE_MARKER}@example.com`);

    // Drive through every attempt, bypassing real backoff wait time by
    // clearing nextAttemptAt between runs (the point under test is the
    // attempt-count/classification logic, not real wall-clock backoff).
    for (let i = 0; i < 5; i++) {
      await processQueuedCommunications(10);
      await prisma.communicationMessage.update({ where: { id: message.id }, data: { nextAttemptAt: null } });
    }

    const final = await prisma.communicationMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(final.status).toBe("FAILED");
    expect(final.attemptCount).toBe(5);

    const attempts = await prisma.communicationDeliveryAttempt.findMany({ where: { messageId: message.id }, orderBy: { attemptNumber: "asc" } });
    expect(attempts).toHaveLength(5);
    expect(attempts.map((a) => a.attemptNumber)).toEqual([1, 2, 3, 4, 5]);
    // Append-only: every attempt's own record survives unchanged (never updated/deleted) as later attempts are appended.
    expect(attempts.every((a) => a.status === "FAILED")).toBe(true);
  });

  it("a permanent provider failure fails the message immediately, on the very first attempt", async () => {
    const { processQueuedCommunications } = await import("@/lib/communications/processor");
    const message = await enqueueForEmail("test-invoice-permanent", `renter+${MOCK_PERMANENT_FAILURE_MARKER}@example.com`);

    await processQueuedCommunications(10);

    const after = await prisma.communicationMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(after.status).toBe("FAILED");
    expect(after.attemptCount).toBe(1);
    expect(after.lastErrorCode).toBe("INVALID_RECIPIENT");
  });

  it("provider-failure isolation: one message's permanent failure does not affect another message's successful send in the same batch", async () => {
    const { processQueuedCommunications } = await import("@/lib/communications/processor");
    const failing = await enqueueForEmail("test-invoice-isolation-fail", `renter+${MOCK_PERMANENT_FAILURE_MARKER}@example.com`);
    const succeeding = await enqueueForEmail("test-invoice-isolation-ok", "renter-ok@example.com");

    await processQueuedCommunications(10);

    const failingAfter = await prisma.communicationMessage.findUniqueOrThrow({ where: { id: failing.id } });
    const succeedingAfter = await prisma.communicationMessage.findUniqueOrThrow({ where: { id: succeeding.id } });
    expect(failingAfter.status).toBe("FAILED");
    expect(succeedingAfter.status).toBe("SENT");
  });
});

describe("Manual retry and cancel", () => {
  beforeAll(async () => {
    await seedActiveTemplateAndRule();
  });

  it("communications.retry moves a FAILED message back to QUEUED without resetting attemptCount", async () => {
    const { processQueuedCommunications } = await import("@/lib/communications/processor");
    const { retryCommunicationMessage } = await import("@/lib/actions/communications");
    const message = await enqueueForEmail("test-invoice-manual-retry", `renter+${MOCK_PERMANENT_FAILURE_MARKER}@example.com`);
    await processQueuedCommunications(10);

    const failed = await prisma.communicationMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(failed.status).toBe("FAILED");
    expect(failed.attemptCount).toBe(1);

    await retryCommunicationMessage(message.id);

    const retried = await prisma.communicationMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(retried.status).toBe("QUEUED");
    expect(retried.attemptCount).toBe(1); // not reset
  });

  it("rejects retrying a message that is not FAILED", async () => {
    const { retryCommunicationMessage } = await import("@/lib/actions/communications");
    const message = await enqueueForEmail("test-invoice-retry-not-failed", "renter-fine@example.com");
    expect(message.status).toBe("QUEUED");
    await expect(retryCommunicationMessage(message.id)).rejects.toThrow();
  });

  it("communications.cancel moves a QUEUED message to CANCELLED, and the processor never touches it again", async () => {
    const { processQueuedCommunications } = await import("@/lib/communications/processor");
    const { cancelCommunicationMessage } = await import("@/lib/actions/communications");
    const message = await enqueueForEmail("test-invoice-cancel", "renter-to-cancel@example.com");

    await cancelCommunicationMessage(message.id);
    const cancelled = await prisma.communicationMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(cancelled.status).toBe("CANCELLED");

    await processQueuedCommunications(10);
    const stillCancelled = await prisma.communicationMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(stillCancelled.status).toBe("CANCELLED");
    expect(stillCancelled.claimedAt).toBeNull();
    const attempts = await prisma.communicationDeliveryAttempt.count({ where: { messageId: message.id } });
    expect(attempts).toBe(0);
  });

  it("rejects cancelling a message that is not QUEUED", async () => {
    const { processQueuedCommunications } = await import("@/lib/communications/processor");
    const { cancelCommunicationMessage } = await import("@/lib/actions/communications");
    const message = await enqueueForEmail("test-invoice-cancel-not-queued", "renter-already-sent@example.com");
    await processQueuedCommunications(10);
    const sent = await prisma.communicationMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(sent.status).toBe("SENT");

    await expect(cancelCommunicationMessage(message.id)).rejects.toThrow();
  });
});

describe("Stuck-processing recovery", () => {
  it("recovers a message stuck in PROCESSING past the threshold back to QUEUED", async () => {
    await seedActiveTemplateAndRule();
    const { processQueuedCommunications } = await import("@/lib/communications/processor");
    const message = await enqueueForEmail("test-invoice-stuck", "renter-stuck@example.com");

    // Simulate a worker that claimed the row and then crashed before recording an outcome.
    await prisma.communicationMessage.update({
      where: { id: message.id },
      data: { status: "PROCESSING", claimedAt: new Date(Date.now() - 10 * 60_000), claimedBy: "crashed-worker" },
    });

    const result = await processQueuedCommunications(10);
    expect(result.recovered).toBeGreaterThanOrEqual(1);

    const after = await prisma.communicationMessage.findUniqueOrThrow({ where: { id: message.id } });
    expect(after.status).toBe("SENT");
  });
});
