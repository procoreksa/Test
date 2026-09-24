/**
 * Real, database-backed tests for the reconciliation job
 * (docs/AUTOMATION-SCHEDULED-JOBS.md, "Reconciliation - defense in depth"):
 * it re-derives the expected CommunicationOutboxEvent for a business record
 * that is durably missing one, creates exactly one per gap, a second run
 * creates zero duplicates, and it never touches a record older than the
 * historical-safety cutoff.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestContract, uniqueSuffix, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";
import { runCommunicationReconciliation, RECONCILIATION_LAUNCH_AT } from "@/lib/automation/reconciliation";
import { invoiceIssuedKey } from "@/lib/automation/outbox-keys";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let org: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  org = await seedFullOrg("AREC");
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

describe("Reconciliation fills exactly one durably-missing outbox event, and a second run creates zero duplicates", () => {
  it("recreates a missing INVOICE_ISSUED outbox event for a recent invoice, then no-ops on a second run", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `AREC-GAP-${uniqueSuffix()}` });
    const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } });
    const { issueInvoiceForSchedule } = await import("@/lib/actions/invoices");
    await issueInvoiceForSchedule(fd({ scheduleId: schedule.id, kind: "RENT" }));
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { contractId: contract.id } });

    // Simulate the exact gap reconciliation exists to close: the durable
    // outbox event that should exist is missing (e.g. a hypothetical bug in
    // the primary same-transaction path).
    await prisma.communicationOutboxEvent.deleteMany({ where: { organizationId: org.organization.id, eventKey: invoiceIssuedKey(invoice.id) } });
    expect(await prisma.communicationOutboxEvent.count({ where: { organizationId: org.organization.id, eventKey: invoiceIssuedKey(invoice.id) } })).toBe(0);

    const firstRun = await runCommunicationReconciliation(new Date());
    const invoiceResult = firstRun.results.find((r) => r.eventType === "INVOICE_ISSUED")!;
    expect(invoiceResult.created).toBeGreaterThanOrEqual(1);
    const afterFirst = await prisma.communicationOutboxEvent.count({ where: { organizationId: org.organization.id, eventKey: invoiceIssuedKey(invoice.id) } });
    expect(afterFirst).toBe(1);

    const secondRun = await runCommunicationReconciliation(new Date());
    const invoiceResultSecond = secondRun.results.find((r) => r.eventType === "INVOICE_ISSUED")!;
    expect(invoiceResultSecond.created).toBe(0);
    const afterSecond = await prisma.communicationOutboxEvent.count({ where: { organizationId: org.organization.id, eventKey: invoiceIssuedKey(invoice.id) } });
    expect(afterSecond).toBe(1);
  });

  it("never re-creates an outbox event for an invoice that already durably has one (the common case)", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `AREC-OK-${uniqueSuffix()}` });
    const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } });
    const { issueInvoiceForSchedule } = await import("@/lib/actions/invoices");
    await issueInvoiceForSchedule(fd({ scheduleId: schedule.id, kind: "RENT" }));
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { contractId: contract.id } });

    const before = await prisma.communicationOutboxEvent.count({ where: { organizationId: org.organization.id, eventKey: invoiceIssuedKey(invoice.id) } });
    expect(before).toBe(1);

    await runCommunicationReconciliation(new Date());
    const after = await prisma.communicationOutboxEvent.count({ where: { organizationId: org.organization.id, eventKey: invoiceIssuedKey(invoice.id) } });
    expect(after).toBe(1);
  });
});

describe("Historical safety: reconciliation never touches a pre-cutoff record (Step 16/85)", () => {
  it("an invoice created before RECONCILIATION_LAUNCH_AT is never given a new outbox event, even though it durably lacks one", async () => {
    const { contract } = await createTestContract(org, { unitNumber: `AREC-HIST-${uniqueSuffix()}` });
    const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } });
    const { issueInvoiceForSchedule } = await import("@/lib/actions/invoices");
    await issueInvoiceForSchedule(fd({ scheduleId: schedule.id, kind: "RENT" }));
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { contractId: contract.id } });

    // Backdate the invoice to before the durability guarantee shipped, and
    // remove its outbox event - simulating a genuinely pre-feature record
    // that was always expected to have none.
    const preCutoff = new Date(RECONCILIATION_LAUNCH_AT.getTime() - 30 * 24 * 60 * 60 * 1000);
    await prisma.invoice.update({ where: { id: invoice.id }, data: { createdAt: preCutoff } });
    await prisma.communicationOutboxEvent.deleteMany({ where: { organizationId: org.organization.id, eventKey: invoiceIssuedKey(invoice.id) } });

    await runCommunicationReconciliation(new Date());

    const event = await prisma.communicationOutboxEvent.findFirst({ where: { organizationId: org.organization.id, eventKey: invoiceIssuedKey(invoice.id) } });
    expect(event).toBeNull();
  });
});
