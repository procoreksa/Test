import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { bucketReceivableAge, aggregateReceivableAging, classifyCountSeverity, AGING_BUCKET_KEYS } from "@/lib/executive/kpi-rules";

const today = new Date("2026-06-15T00:00:00");

describe("bucketReceivableAge", () => {
  it("a due date today or in the future is CURRENT", () => {
    expect(bucketReceivableAge(new Date("2026-06-15T00:00:00"), today)).toBe("CURRENT");
    expect(bucketReceivableAge(new Date("2026-07-01T00:00:00"), today)).toBe("CURRENT");
  });

  it("buckets 1-30/31-60/61-90/90+ days past due correctly at the boundaries", () => {
    expect(bucketReceivableAge(new Date("2026-06-14T00:00:00"), today)).toBe("DAYS_1_30");
    expect(bucketReceivableAge(new Date("2026-05-16T00:00:00"), today)).toBe("DAYS_1_30");
    expect(bucketReceivableAge(new Date("2026-05-15T00:00:00"), today)).toBe("DAYS_31_60");
    expect(bucketReceivableAge(new Date("2026-04-16T00:00:00"), today)).toBe("DAYS_31_60");
    expect(bucketReceivableAge(new Date("2026-04-15T00:00:00"), today)).toBe("DAYS_61_90");
    expect(bucketReceivableAge(new Date("2026-03-17T00:00:00"), today)).toBe("DAYS_61_90");
    expect(bucketReceivableAge(new Date("2026-03-16T00:00:00"), today)).toBe("DAYS_90_PLUS");
  });

  it("a null due date is UNDATED, never silently folded into CURRENT", () => {
    expect(bucketReceivableAge(null, today)).toBe("UNDATED");
  });
});

describe("aggregateReceivableAging", () => {
  it("mandatory reconciliation invariant: bucket totals always sum to the outstanding total", () => {
    const rows = [
      { dueDate: new Date("2026-07-01T00:00:00"), outstanding: new Prisma.Decimal(100) },
      { dueDate: new Date("2026-06-01T00:00:00"), outstanding: new Prisma.Decimal(200) },
      { dueDate: new Date("2026-01-01T00:00:00"), outstanding: new Prisma.Decimal(50) },
      { dueDate: null, outstanding: new Prisma.Decimal(25) },
    ];
    const result = aggregateReceivableAging(rows, today);
    const bucketSum = AGING_BUCKET_KEYS.reduce((sum, k) => sum.plus(result.buckets[k]), new Prisma.Decimal(0));
    expect(bucketSum.toString()).toBe(result.total.toString());
    expect(result.total.toString()).toBe("375");
  });

  it("an empty input produces a zeroed, still-fully-keyed summary", () => {
    const result = aggregateReceivableAging([], today);
    for (const key of AGING_BUCKET_KEYS) {
      expect(result.buckets[key].toString()).toBe("0");
      expect(result.bucketCounts[key]).toBe(0);
    }
    expect(result.total.toString()).toBe("0");
  });
});

describe("classifyCountSeverity", () => {
  it("returns null (nothing to surface) at or below zero", () => {
    expect(classifyCountSeverity(0, 1, 5)).toBeNull();
    expect(classifyCountSeverity(-1, 1, 5)).toBeNull();
  });

  it("returns WARNING between the warn and critical thresholds, CRITICAL at or above the critical threshold", () => {
    expect(classifyCountSeverity(1, 1, 5)).toBe("WARNING");
    expect(classifyCountSeverity(4, 1, 5)).toBe("WARNING");
    expect(classifyCountSeverity(5, 1, 5)).toBe("CRITICAL");
    expect(classifyCountSeverity(100, 1, 5)).toBe("CRITICAL");
  });
});
