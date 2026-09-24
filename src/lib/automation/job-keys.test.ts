import { describe, it, expect } from "vitest";
import {
  rentDueReminderKey,
  contractExpiryReminderKey,
  moveInReminderKey,
  moveOutReminderKey,
  maintenanceSlaCheckKey,
} from "@/lib/automation/job-keys";

describe("rentDueReminderKey", () => {
  it("embeds schedule id, offset, and due date", () => {
    expect(rentDueReminderKey("sched1", -3, new Date("2026-06-15T00:00:00Z"))).toBe("sched1:-3:2026-06-15");
  });

  it("produces a different key when the due date changes (a reschedule is a new logical job)", () => {
    const original = rentDueReminderKey("sched1", 0, new Date("2026-06-15T00:00:00Z"));
    const rescheduled = rentDueReminderKey("sched1", 0, new Date("2026-06-20T00:00:00Z"));
    expect(original).not.toBe(rescheduled);
  });

  it("produces the same key for the same inputs (idempotent)", () => {
    const a = rentDueReminderKey("sched1", -7, new Date("2026-06-15T00:00:00Z"));
    const b = rentDueReminderKey("sched1", -7, new Date("2026-06-15T00:00:00Z"));
    expect(a).toBe(b);
  });

  it("produces different keys for different offsets on the same schedule", () => {
    const offsetA = rentDueReminderKey("sched1", -7, new Date("2026-06-15T00:00:00Z"));
    const offsetB = rentDueReminderKey("sched1", -3, new Date("2026-06-15T00:00:00Z"));
    expect(offsetA).not.toBe(offsetB);
  });
});

describe("contractExpiryReminderKey", () => {
  it("embeds contract id, offset, and end date", () => {
    expect(contractExpiryReminderKey("c1", 30, new Date("2026-12-31T00:00:00Z"))).toBe("c1:30:2026-12-31");
  });

  it("changes when the end date changes (a renewal produces a new logical job)", () => {
    const before = contractExpiryReminderKey("c1", 30, new Date("2026-12-31T00:00:00Z"));
    const afterRenewal = contractExpiryReminderKey("c1", 30, new Date("2027-12-31T00:00:00Z"));
    expect(before).not.toBe(afterRenewal);
  });
});

describe("moveInReminderKey / moveOutReminderKey", () => {
  it("embed the full scheduled instant, not just the calendar date", () => {
    const morning = moveInReminderKey("mi1", 1, new Date("2026-06-15T08:00:00Z"));
    const afternoon = moveInReminderKey("mi1", 1, new Date("2026-06-15T14:00:00Z"));
    expect(morning).not.toBe(afternoon);
  });

  it("moveOutReminderKey follows the identical shape", () => {
    expect(moveOutReminderKey("mo1", 1, new Date("2026-06-15T08:00:00Z"))).toBe("mo1:1:2026-06-15T08:00:00.000Z");
  });
});

describe("maintenanceSlaCheckKey", () => {
  it("dedupes to exactly one key per (request, calendar day)", () => {
    const morningRun = maintenanceSlaCheckKey("req1", "2026-06-15");
    const eveningRun = maintenanceSlaCheckKey("req1", "2026-06-15");
    expect(morningRun).toBe(eveningRun);
  });

  it("produces a new key on a new calendar day", () => {
    const day1 = maintenanceSlaCheckKey("req1", "2026-06-15");
    const day2 = maintenanceSlaCheckKey("req1", "2026-06-16");
    expect(day1).not.toBe(day2);
  });
});
