/**
 * Real, database-backed multi-tenancy tests for Automation & Scheduled Jobs:
 * an organization can never list, read, retry, or cancel another
 * organization's AutomationJob/CommunicationOutboxEvent rows (IDOR), and a
 * job's own payload is never trusted to reference a record in the job's own
 * organization - a handler always re-verifies the payload's relation ids
 * against `ctx.organizationId` itself (Step 69/70's cross-org payload
 * injection requirement).
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { resetDatabase, seedFullOrg, createTestContract, uniqueSuffix, type SeededOrg } from "./db-test-helpers";
import { prisma } from "@/lib/prisma";
import { rentDueReminderKey } from "@/lib/automation/job-keys";
import { AUTOMATION_HANDLERS } from "@/lib/automation/handlers";
import type { RentDueReminderPayload } from "@/lib/automation/handlers/rent-due-reminder";
import type { Prisma } from "@prisma/client";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => mockAuth() }));

let orgA: SeededOrg;
let orgB: SeededOrg;

beforeAll(async () => {
  await resetDatabase();
  orgA = await seedFullOrg("ACX-A");
  orgB = await seedFullOrg("ACX-B");
});

beforeEach(() => {
  mockAuth.mockReset();
});

async function insertJobFor(org: SeededOrg, jobKey: string, payloadJson: Record<string, unknown>) {
  return prisma.automationJob.create({
    data: {
      organizationId: org.organization.id,
      jobType: "RENT_DUE_REMINDER",
      jobKey,
      status: "PENDING",
      scheduledFor: new Date(),
      availableAt: new Date(),
      payloadVersion: 1,
      payloadJson: payloadJson as unknown as Prisma.InputJsonValue,
    },
  });
}

describe("Automation jobs/outbox are strictly org-scoped (IDOR)", () => {
  it("listAutomationJobs never returns another organization's jobs", async () => {
    const { contract: contractA } = await createTestContract(orgA, { unitNumber: `ACX-A-${uniqueSuffix()}` });
    const scheduleA = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contractA.id } });
    await insertJobFor(orgA, rentDueReminderKey(scheduleA.id, 0, scheduleA.dueDate), { scheduleId: scheduleA.id, offsetDays: 0, dueDate: scheduleA.dueDate.toISOString() });

    const { contract: contractB } = await createTestContract(orgB, { unitNumber: `ACX-B-${uniqueSuffix()}` });
    const scheduleB = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contractB.id } });
    await insertJobFor(orgB, rentDueReminderKey(scheduleB.id, 0, scheduleB.dueDate), { scheduleId: scheduleB.id, offsetDays: 0, dueDate: scheduleB.dueDate.toISOString() });

    mockAuth.mockResolvedValue(orgA.session);
    const { listAutomationJobs } = await import("@/lib/actions/automation");
    const { rows } = await listAutomationJobs({});
    expect(rows.every((r) => r.jobType === "RENT_DUE_REMINDER")).toBe(true);
    const jobKeysSeen = rows.map((r) => r.id);
    const orgBJob = await prisma.automationJob.findFirstOrThrow({ where: { organizationId: orgB.organization.id } });
    expect(jobKeysSeen).not.toContain(orgBJob.id);
  });

  it("getAutomationJobById rejects Org B's job id when called as Org A", async () => {
    const { contract } = await createTestContract(orgB, { unitNumber: `ACX-GETB-${uniqueSuffix()}` });
    const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } });
    const job = await insertJobFor(orgB, rentDueReminderKey(schedule.id, 3, schedule.dueDate), { scheduleId: schedule.id, offsetDays: 3, dueDate: schedule.dueDate.toISOString() });

    mockAuth.mockResolvedValue(orgA.session);
    const { getAutomationJobById } = await import("@/lib/actions/automation");
    await expect(getAutomationJobById(job.id)).rejects.toThrow();
  });

  it("retryAutomationJob rejects Org B's job id when called as Org A, and never mutates it", async () => {
    const { contract } = await createTestContract(orgB, { unitNumber: `ACX-RETRYB-${uniqueSuffix()}` });
    const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } });
    const job = await prisma.automationJob.create({
      data: {
        organizationId: orgB.organization.id,
        jobType: "RENT_DUE_REMINDER",
        jobKey: rentDueReminderKey(schedule.id, -3, schedule.dueDate),
        status: "FAILED",
        scheduledFor: new Date(),
        availableAt: new Date(),
        payloadVersion: 1,
        payloadJson: { scheduleId: schedule.id, offsetDays: -3, dueDate: schedule.dueDate.toISOString() } as unknown as Prisma.InputJsonValue,
      },
    });

    mockAuth.mockResolvedValue(orgA.session);
    const { retryAutomationJob } = await import("@/lib/actions/automation");
    await expect(retryAutomationJob(job.id)).rejects.toThrow();

    const unchanged = await prisma.automationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(unchanged.status).toBe("FAILED");
  });

  it("cancelAutomationJob rejects Org B's job id when called as Org A", async () => {
    const { contract } = await createTestContract(orgB, { unitNumber: `ACX-CANCELB-${uniqueSuffix()}` });
    const schedule = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contract.id } });
    const job = await insertJobFor(orgB, rentDueReminderKey(schedule.id, 7, schedule.dueDate) + "-cancel", { scheduleId: schedule.id, offsetDays: 7, dueDate: schedule.dueDate.toISOString() });

    mockAuth.mockResolvedValue(orgA.session);
    const { cancelAutomationJob } = await import("@/lib/actions/automation");
    await expect(cancelAutomationJob(job.id)).rejects.toThrow();

    const unchanged = await prisma.automationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(unchanged.status).toBe("PENDING");
  });

  it("listOutboxEvents and retryOutboxEvent never reach another organization's outbox rows", async () => {
    const eventB = await prisma.communicationOutboxEvent.create({
      data: {
        organizationId: orgB.organization.id,
        eventType: "PAYMENT_RECEIVED",
        eventKey: `ACX-OUTBOX-B-${uniqueSuffix()}`,
        status: "FAILED",
        payloadVersion: 1,
        payloadJson: { businessEntityType: "Payment", businessEntityId: "x", language: "en", variables: {}, recipients: [] } as unknown as Prisma.InputJsonValue,
      },
    });

    mockAuth.mockResolvedValue(orgA.session);
    const { listOutboxEvents, retryOutboxEvent } = await import("@/lib/actions/automation");
    const { rows } = await listOutboxEvents({});
    expect(rows.map((r) => r.id)).not.toContain(eventB.id);
    await expect(retryOutboxEvent(eventB.id)).rejects.toThrow();

    const unchanged = await prisma.communicationOutboxEvent.findUniqueOrThrow({ where: { id: eventB.id } });
    expect(unchanged.status).toBe("FAILED");
  });
});

describe("Cross-org payload injection: a handler never trusts a payload's relation id blindly (Step 70)", () => {
  it("a RENT_DUE_REMINDER job scoped to Org A whose payload references Org B's PaymentSchedule is rejected (SKIPPED, not executed against Org B's data)", async () => {
    const { contract: contractB } = await createTestContract(orgB, { unitNumber: `ACX-INJECT-B-${uniqueSuffix()}` });
    const scheduleB = await prisma.paymentSchedule.findFirstOrThrow({ where: { contractId: contractB.id } });

    // A job record OWNED by Org A, but its payload points at Org B's schedule.
    const forgedPayload: RentDueReminderPayload = { scheduleId: scheduleB.id, offsetDays: 0, dueDate: scheduleB.dueDate.toISOString() };

    const handler = AUTOMATION_HANDLERS.RENT_DUE_REMINDER!;
    const outcome = await handler({
      organizationId: orgA.organization.id,
      jobId: "synthetic-job-id",
      jobKey: "synthetic-job-key",
      scheduledFor: new Date(),
      payloadVersion: 1,
      payloadJson: forgedPayload as unknown as Prisma.JsonValue,
    });

    // The handler's own `organizationId` filter means Org B's schedule is
    // simply "not found" from Org A's perspective - never leaked, never
    // acted on.
    expect(outcome.kind).toBe("SKIPPED");

    const crossOrgOutbox = await prisma.communicationOutboxEvent.count({ where: { organizationId: orgA.organization.id, eventType: "RENT_DUE_REMINDER" } });
    expect(crossOrgOutbox).toBe(0);
  });
});
