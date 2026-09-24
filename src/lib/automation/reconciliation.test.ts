import { describe, it, expect } from "vitest";
import { windowStart, RECONCILIATION_LAUNCH_AT, RECONCILIATION_LOOKBACK_DAYS } from "@/lib/automation/reconciliation";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("windowStart (Step 16/85 - reconciliation's historical-safety cutoff)", () => {
  it("uses the lookback window when 'now' is well after the launch cutoff", () => {
    const now = new Date(RECONCILIATION_LAUNCH_AT.getTime() + 365 * DAY_MS);
    const expected = new Date(now.getTime() - RECONCILIATION_LOOKBACK_DAYS * DAY_MS);
    expect(windowStart(now).getTime()).toBe(expected.getTime());
  });

  it("never goes earlier than the launch cutoff, even when 'now' is close to it (never blasts pre-feature records)", () => {
    const now = new Date(RECONCILIATION_LAUNCH_AT.getTime() + 1 * DAY_MS);
    expect(windowStart(now).getTime()).toBe(RECONCILIATION_LAUNCH_AT.getTime());
  });

  it("clamps to the launch cutoff even when 'now' is before it", () => {
    const now = new Date(RECONCILIATION_LAUNCH_AT.getTime() - 30 * DAY_MS);
    expect(windowStart(now).getTime()).toBe(RECONCILIATION_LAUNCH_AT.getTime());
  });
});
