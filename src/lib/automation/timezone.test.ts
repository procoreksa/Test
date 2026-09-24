import { describe, it, expect } from "vitest";
import { isValidIanaTimeZone, zonedTimeToUtc, zonedDateKey, zonedStartOfDay, zonedStartOfDayOffset } from "@/lib/automation/timezone";

describe("isValidIanaTimeZone", () => {
  it("accepts real IANA zones", () => {
    expect(isValidIanaTimeZone("Asia/Riyadh")).toBe(true);
    expect(isValidIanaTimeZone("America/New_York")).toBe(true);
    expect(isValidIanaTimeZone("UTC")).toBe(true);
  });

  it("rejects garbage input", () => {
    expect(isValidIanaTimeZone("")).toBe(false);
    expect(isValidIanaTimeZone("Not/A_Zone")).toBe(false);
    expect(isValidIanaTimeZone("Riyadh")).toBe(false);
  });
});

describe("zonedTimeToUtc / zonedDateKey (Asia/Riyadh - fixed +03:00, no DST)", () => {
  it("local midnight in Riyadh is 21:00 UTC the previous day", () => {
    const utc = zonedTimeToUtc(2026, 6, 15, 0, 0, 0, "Asia/Riyadh");
    expect(utc.toISOString()).toBe("2026-06-14T21:00:00.000Z");
  });

  it("round-trips through zonedDateKey", () => {
    const utc = zonedTimeToUtc(2026, 1, 1, 12, 0, 0, "Asia/Riyadh");
    expect(zonedDateKey(utc, "Asia/Riyadh")).toBe("2026-01-01");
  });
});

describe("DST correctness (America/New_York)", () => {
  it("resolves standard time (EST, UTC-5) outside DST", () => {
    const utc = zonedTimeToUtc(2026, 1, 15, 9, 0, 0, "America/New_York");
    expect(utc.toISOString()).toBe("2026-01-15T14:00:00.000Z");
  });

  it("resolves daylight time (EDT, UTC-4) during DST", () => {
    const utc = zonedTimeToUtc(2026, 7, 15, 9, 0, 0, "America/New_York");
    expect(utc.toISOString()).toBe("2026-07-15T13:00:00.000Z");
  });

  it("correctly shifts across the spring-forward transition (2026-03-08)", () => {
    // Before: EST (UTC-5); after: EDT (UTC-4) - a midnight-anchored job
    // window must use the correct offset for ITS OWN side of the transition.
    const beforeUtc = zonedTimeToUtc(2026, 3, 7, 0, 0, 0, "America/New_York");
    const afterUtc = zonedTimeToUtc(2026, 3, 9, 0, 0, 0, "America/New_York");
    expect(beforeUtc.toISOString()).toBe("2026-03-07T05:00:00.000Z");
    expect(afterUtc.toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });
});

describe("zonedStartOfDay", () => {
  it("returns the same instant regardless of what time-of-day is passed in, for the same calendar day", () => {
    const morning = zonedStartOfDay(new Date("2026-06-15T04:00:00Z"), "Asia/Riyadh");
    const evening = zonedStartOfDay(new Date("2026-06-15T20:00:00Z"), "Asia/Riyadh");
    expect(morning.toISOString()).toBe(evening.toISOString());
  });
});

describe("zonedStartOfDayOffset", () => {
  it("adds calendar days in the target timezone, not raw milliseconds", () => {
    const base = zonedTimeToUtc(2026, 6, 15, 0, 0, 0, "Asia/Riyadh");
    const plus7 = zonedStartOfDayOffset(base, 7, "Asia/Riyadh");
    expect(zonedDateKey(plus7, "Asia/Riyadh")).toBe("2026-06-22");
  });

  it("negative offsets move backward", () => {
    const base = zonedTimeToUtc(2026, 6, 15, 0, 0, 0, "Asia/Riyadh");
    const minus3 = zonedStartOfDayOffset(base, -3, "Asia/Riyadh");
    expect(zonedDateKey(minus3, "Asia/Riyadh")).toBe("2026-06-12");
  });

  it("stays correct across a DST-observing zone's spring-forward day", () => {
    const base = zonedTimeToUtc(2026, 3, 1, 0, 0, 0, "America/New_York");
    const plus10 = zonedStartOfDayOffset(base, 10, "America/New_York");
    expect(zonedDateKey(plus10, "America/New_York")).toBe("2026-03-11");
  });
});
