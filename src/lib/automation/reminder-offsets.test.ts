import { describe, it, expect } from "vitest";
import {
  RENT_DUE_REMINDER_OFFSETS_DAYS,
  CONTRACT_EXPIRY_REMINDER_OFFSETS_DAYS,
  MOVE_IN_REMINDER_OFFSET_DAYS,
  MOVE_OUT_REMINDER_OFFSET_DAYS,
  SCHEDULER_LOOKAHEAD_DAYS,
} from "@/lib/automation/reminder-offsets";

describe("reminder offset defaults", () => {
  it("rent-due offsets are distinct and include on-due-date (0)", () => {
    expect(new Set(RENT_DUE_REMINDER_OFFSETS_DAYS).size).toBe(RENT_DUE_REMINDER_OFFSETS_DAYS.length);
    expect(RENT_DUE_REMINDER_OFFSETS_DAYS).toContain(0);
  });

  it("contract-expiry offsets are all positive (days BEFORE the end date) and distinct", () => {
    expect(CONTRACT_EXPIRY_REMINDER_OFFSETS_DAYS.every((d) => d > 0)).toBe(true);
    expect(new Set(CONTRACT_EXPIRY_REMINDER_OFFSETS_DAYS).size).toBe(CONTRACT_EXPIRY_REMINDER_OFFSETS_DAYS.length);
  });

  it("move-in/move-out single offsets are positive (days BEFORE the scheduled instant)", () => {
    expect(MOVE_IN_REMINDER_OFFSET_DAYS).toBeGreaterThan(0);
    expect(MOVE_OUT_REMINDER_OFFSET_DAYS).toBeGreaterThan(0);
  });

  it("scheduler lookahead is bounded (never years into the future - Step 21)", () => {
    expect(SCHEDULER_LOOKAHEAD_DAYS).toBeGreaterThan(0);
    expect(SCHEDULER_LOOKAHEAD_DAYS).toBeLessThanOrEqual(90);
  });
});
