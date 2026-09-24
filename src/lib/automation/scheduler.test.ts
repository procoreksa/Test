import { describe, it, expect } from "vitest";
import { withinSchedulingWindow, PAST_GRACE_DAYS } from "@/lib/automation/scheduler";
import { SCHEDULER_LOOKAHEAD_DAYS } from "@/lib/automation/reminder-offsets";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date("2026-06-15T00:00:00Z");

describe("withinSchedulingWindow", () => {
  it("accepts a fire date exactly at 'now'", () => {
    expect(withinSchedulingWindow(now, now)).toBe(true);
  });

  it("accepts a fire date within the forward lookahead window", () => {
    const fireDate = new Date(now.getTime() + (SCHEDULER_LOOKAHEAD_DAYS - 1) * DAY_MS);
    expect(withinSchedulingWindow(fireDate, now)).toBe(true);
  });

  it("rejects a fire date beyond the forward lookahead window (never materializes years of future jobs)", () => {
    const tooFar = new Date(now.getTime() + (SCHEDULER_LOOKAHEAD_DAYS + 1) * DAY_MS);
    expect(withinSchedulingWindow(tooFar, now)).toBe(false);
  });

  it("accepts a fire date within the past grace period (an org that just enabled a reminder still sees recent misses)", () => {
    const recentlyPast = new Date(now.getTime() - (PAST_GRACE_DAYS - 1) * DAY_MS);
    expect(withinSchedulingWindow(recentlyPast, now)).toBe(true);
  });

  it("rejects a fire date older than the past grace period (historical safety - never blasts months-old reminders)", () => {
    const tooOld = new Date(now.getTime() - (PAST_GRACE_DAYS + 1) * DAY_MS);
    expect(withinSchedulingWindow(tooOld, now)).toBe(false);
  });
});
