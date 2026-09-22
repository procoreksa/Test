import { describe, it, expect } from "vitest";
import {
  hasTimeOverlap,
  isBlockingViewingStatus,
  isValidViewingTransition,
  computeViewingCompletionRate,
  computeOutcomeRate,
  dateBucketRange,
} from "./viewing-rules";

describe("hasTimeOverlap", () => {
  it("detects a clear overlap", () => {
    const existingStart = new Date("2026-06-15T10:00:00Z");
    const existingEnd = new Date("2026-06-15T11:00:00Z");
    const newStart = new Date("2026-06-15T10:30:00Z");
    const newEnd = new Date("2026-06-15T11:30:00Z");
    expect(hasTimeOverlap(existingStart, existingEnd, newStart, newEnd)).toBe(true);
  });

  it("detects the new range fully containing the existing one", () => {
    const existingStart = new Date("2026-06-15T10:15:00Z");
    const existingEnd = new Date("2026-06-15T10:45:00Z");
    const newStart = new Date("2026-06-15T10:00:00Z");
    const newEnd = new Date("2026-06-15T11:00:00Z");
    expect(hasTimeOverlap(existingStart, existingEnd, newStart, newEnd)).toBe(true);
  });

  it("boundary case: existing ends exactly when new starts -> no overlap", () => {
    const existingStart = new Date("2026-06-15T10:00:00Z");
    const existingEnd = new Date("2026-06-15T11:00:00Z");
    const newStart = new Date("2026-06-15T11:00:00Z");
    const newEnd = new Date("2026-06-15T12:00:00Z");
    expect(hasTimeOverlap(existingStart, existingEnd, newStart, newEnd)).toBe(false);
  });

  it("boundary case: new ends exactly when existing starts -> no overlap", () => {
    const existingStart = new Date("2026-06-15T11:00:00Z");
    const existingEnd = new Date("2026-06-15T12:00:00Z");
    const newStart = new Date("2026-06-15T10:00:00Z");
    const newEnd = new Date("2026-06-15T11:00:00Z");
    expect(hasTimeOverlap(existingStart, existingEnd, newStart, newEnd)).toBe(false);
  });

  it("no overlap when ranges are far apart", () => {
    const existingStart = new Date("2026-06-15T09:00:00Z");
    const existingEnd = new Date("2026-06-15T10:00:00Z");
    const newStart = new Date("2026-06-15T14:00:00Z");
    const newEnd = new Date("2026-06-15T15:00:00Z");
    expect(hasTimeOverlap(existingStart, existingEnd, newStart, newEnd)).toBe(false);
  });
});

describe("isBlockingViewingStatus", () => {
  it("SCHEDULED/CONFIRMED/IN_PROGRESS block", () => {
    expect(isBlockingViewingStatus("SCHEDULED")).toBe(true);
    expect(isBlockingViewingStatus("CONFIRMED")).toBe(true);
    expect(isBlockingViewingStatus("IN_PROGRESS")).toBe(true);
  });

  it("COMPLETED/CANCELLED/NO_SHOW do not block", () => {
    expect(isBlockingViewingStatus("COMPLETED")).toBe(false);
    expect(isBlockingViewingStatus("CANCELLED")).toBe(false);
    expect(isBlockingViewingStatus("NO_SHOW")).toBe(false);
  });
});

describe("isValidViewingTransition", () => {
  it("allows the documented forward chain", () => {
    expect(isValidViewingTransition("SCHEDULED", "CONFIRMED")).toBe(true);
    expect(isValidViewingTransition("CONFIRMED", "IN_PROGRESS")).toBe(true);
    expect(isValidViewingTransition("IN_PROGRESS", "COMPLETED")).toBe(true);
  });

  it("allows SCHEDULED/CONFIRMED -> CANCELLED and -> NO_SHOW", () => {
    expect(isValidViewingTransition("SCHEDULED", "CANCELLED")).toBe(true);
    expect(isValidViewingTransition("CONFIRMED", "CANCELLED")).toBe(true);
    expect(isValidViewingTransition("SCHEDULED", "NO_SHOW")).toBe(true);
    expect(isValidViewingTransition("CONFIRMED", "NO_SHOW")).toBe(true);
  });

  it("allows any active status -> RESCHEDULED -> SCHEDULED/CONFIRMED", () => {
    expect(isValidViewingTransition("SCHEDULED", "RESCHEDULED")).toBe(true);
    expect(isValidViewingTransition("CONFIRMED", "RESCHEDULED")).toBe(true);
    expect(isValidViewingTransition("IN_PROGRESS", "RESCHEDULED")).toBe(true);
    expect(isValidViewingTransition("RESCHEDULED", "SCHEDULED")).toBe(true);
    expect(isValidViewingTransition("RESCHEDULED", "CONFIRMED")).toBe(true);
  });

  it("rejects invalid transitions from terminal states", () => {
    expect(isValidViewingTransition("COMPLETED", "IN_PROGRESS")).toBe(false);
    expect(isValidViewingTransition("CANCELLED", "COMPLETED")).toBe(false);
    expect(isValidViewingTransition("NO_SHOW", "CONFIRMED")).toBe(false);
  });

  it("rejects skipping the confirm/start steps", () => {
    expect(isValidViewingTransition("SCHEDULED", "IN_PROGRESS")).toBe(false);
    expect(isValidViewingTransition("SCHEDULED", "COMPLETED")).toBe(false);
  });
});

describe("computeViewingCompletionRate", () => {
  it("is Completed / (Completed + Cancelled + No-Show)", () => {
    expect(computeViewingCompletionRate(6, 2, 2)).toBe(60);
  });

  it("is 0 (not NaN) when there are no ended viewings yet", () => {
    expect(computeViewingCompletionRate(0, 0, 0)).toBe(0);
  });
});

describe("computeOutcomeRate", () => {
  it("computes interest/offer/reservation rate with the same formula", () => {
    expect(computeOutcomeRate(3, 10)).toBe(30);
    expect(computeOutcomeRate(0, 10)).toBe(0);
    expect(computeOutcomeRate(0, 0)).toBe(0);
  });
});

describe("dateBucketRange", () => {
  const now = new Date("2026-06-17T15:00:00"); // a Wednesday

  it("today is [start of today, start of tomorrow)", () => {
    const { from, to } = dateBucketRange("today", now);
    expect(from.getDate()).toBe(17);
    expect(to.getDate()).toBe(18);
  });

  it("tomorrow is [start of tomorrow, start of day after)", () => {
    const { from, to } = dateBucketRange("tomorrow", now);
    expect(from.getDate()).toBe(18);
    expect(to.getDate()).toBe(19);
  });

  it("thisWeek spans Sunday through the following Sunday", () => {
    const { from, to } = dateBucketRange("thisWeek", now);
    expect(from.getDay()).toBe(0);
    expect(to.getTime() - from.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
