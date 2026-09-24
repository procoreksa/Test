import { describe, it, expect } from "vitest";
import { resolveDateRange, toPrismaRange } from "@/lib/executive/date-range";

describe("resolveDateRange", () => {
  it("TODAY is [start of day, start of next day) - start-inclusive, end-exclusive", () => {
    const now = new Date("2026-03-15T14:30:00");
    const r = resolveDateRange("TODAY", now);
    expect(r.start.toISOString()).toBe(new Date("2026-03-15T00:00:00").toISOString());
    expect(r.end.toISOString()).toBe(new Date("2026-03-16T00:00:00").toISOString());
  });

  it("THIS_MONTH spans the whole calendar month regardless of the day `now` falls on", () => {
    const now = new Date("2026-02-10T09:00:00");
    const r = resolveDateRange("THIS_MONTH", now);
    expect(r.start.toISOString()).toBe(new Date("2026-02-01T00:00:00").toISOString());
    expect(r.end.toISOString()).toBe(new Date("2026-03-01T00:00:00").toISOString());
  });

  it("THIS_MONTH handles a leap-day February correctly (2028 is a leap year)", () => {
    const now = new Date("2028-02-15T00:00:00");
    const r = resolveDateRange("THIS_MONTH", now);
    expect(r.end.toISOString()).toBe(new Date("2028-03-01T00:00:00").toISOString());
  });

  it("LAST_MONTH crosses a year boundary correctly (January -> previous December)", () => {
    const now = new Date("2026-01-10T00:00:00");
    const r = resolveDateRange("LAST_MONTH", now);
    expect(r.start.toISOString()).toBe(new Date("2025-12-01T00:00:00").toISOString());
    expect(r.end.toISOString()).toBe(new Date("2026-01-01T00:00:00").toISOString());
  });

  it("THIS_YEAR spans January 1 to the following January 1", () => {
    const now = new Date("2026-07-01T00:00:00");
    const r = resolveDateRange("THIS_YEAR", now);
    expect(r.start.toISOString()).toBe(new Date("2026-01-01T00:00:00").toISOString());
    expect(r.end.toISOString()).toBe(new Date("2027-01-01T00:00:00").toISOString());
  });

  it("THIS_QUARTER resolves to the calendar quarter containing `now`", () => {
    const now = new Date("2026-05-15T00:00:00");
    const r = resolveDateRange("THIS_QUARTER", now);
    expect(r.start.toISOString()).toBe(new Date("2026-04-01T00:00:00").toISOString());
    expect(r.end.toISOString()).toBe(new Date("2026-07-01T00:00:00").toISOString());
  });

  it("CUSTOM converts an inclusive end date into the exclusive start-of-next-day boundary", () => {
    const now = new Date("2026-06-01T00:00:00");
    const r = resolveDateRange("CUSTOM", now, "2026-01-01", "2026-01-31");
    expect(r.start.toISOString()).toBe(new Date("2026-01-01T00:00:00").toISOString());
    expect(r.end.toISOString()).toBe(new Date("2026-02-01T00:00:00").toISOString());
  });

  it("CUSTOM falls back to THIS_MONTH when the end date is before the start date", () => {
    const now = new Date("2026-06-15T00:00:00");
    const r = resolveDateRange("CUSTOM", now, "2026-06-20", "2026-06-01");
    expect(r.start.toISOString()).toBe(new Date("2026-06-01T00:00:00").toISOString());
    expect(r.end.toISOString()).toBe(new Date("2026-07-01T00:00:00").toISOString());
  });

  it("toPrismaRange maps to a { gte, lt } filter shape", () => {
    const r = resolveDateRange("TODAY", new Date("2026-03-15T00:00:00"));
    const prismaRange = toPrismaRange(r);
    expect(prismaRange).toEqual({ gte: r.start, lt: r.end });
  });
});
