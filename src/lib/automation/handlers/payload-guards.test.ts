import { describe, it, expect } from "vitest";
import { isRentDueReminderPayload } from "@/lib/automation/handlers/rent-due-reminder";
import { isContractExpiryReminderPayload } from "@/lib/automation/handlers/contract-expiry-reminder";
import { isMoveInReminderPayload } from "@/lib/automation/handlers/move-in-reminder";
import { isMoveOutReminderPayload } from "@/lib/automation/handlers/move-out-reminder";
import { isMaintenanceSlaCheckPayload } from "@/lib/automation/handlers/maintenance-sla-check";

describe("isRentDueReminderPayload", () => {
  it("accepts a well-formed payload", () => {
    expect(isRentDueReminderPayload({ scheduleId: "s1", offsetDays: -3, dueDate: "2026-06-15T00:00:00.000Z" })).toBe(true);
  });
  it("rejects a payload missing scheduleId", () => {
    expect(isRentDueReminderPayload({ offsetDays: -3, dueDate: "2026-06-15T00:00:00.000Z" })).toBe(false);
  });
  it("rejects non-object payloads", () => {
    expect(isRentDueReminderPayload(null)).toBe(false);
    expect(isRentDueReminderPayload("bad")).toBe(false);
  });
});

describe("isContractExpiryReminderPayload", () => {
  it("accepts a well-formed payload", () => {
    expect(isContractExpiryReminderPayload({ contractId: "c1", offsetDays: 30, endDate: "2026-12-31T00:00:00.000Z" })).toBe(true);
  });
  it("rejects a payload with the wrong field types", () => {
    expect(isContractExpiryReminderPayload({ contractId: "c1", offsetDays: "30", endDate: "2026-12-31T00:00:00.000Z" })).toBe(false);
  });
});

describe("isMoveInReminderPayload / isMoveOutReminderPayload", () => {
  it("accept a well-formed payload", () => {
    expect(isMoveInReminderPayload({ moveInId: "mi1", offsetDays: 1, scheduledAt: "2026-06-15T08:00:00.000Z" })).toBe(true);
    expect(isMoveOutReminderPayload({ moveOutId: "mo1", offsetDays: 1, scheduledAt: "2026-06-15T08:00:00.000Z" })).toBe(true);
  });
  it("reject a payload missing the scheduledAt snapshot needed for staleness recheck", () => {
    expect(isMoveInReminderPayload({ moveInId: "mi1", offsetDays: 1 })).toBe(false);
    expect(isMoveOutReminderPayload({ moveOutId: "mo1", offsetDays: 1 })).toBe(false);
  });
});

describe("isMaintenanceSlaCheckPayload", () => {
  it("accepts a well-formed payload", () => {
    expect(isMaintenanceSlaCheckPayload({ requestId: "req1" })).toBe(true);
  });
  it("rejects a payload missing requestId", () => {
    expect(isMaintenanceSlaCheckPayload({})).toBe(false);
  });
});
