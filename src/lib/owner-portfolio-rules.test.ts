import { describe, it, expect } from "vitest";
import { computeOccupancySummary } from "@/lib/owner-portfolio-rules";

describe("computeOccupancySummary", () => {
  it("computes occupancyRate as occupied/total rounded to the nearest percent", () => {
    const result = computeOccupancySummary(["OCCUPIED", "OCCUPIED", "VACANT", "VACANT"]);
    expect(result).toEqual({ total: 4, occupied: 2, vacant: 2, occupancyRate: 50 });
  });

  it("rounds to the nearest whole percent, not truncated", () => {
    // 2/3 = 66.67% -> rounds to 67
    const result = computeOccupancySummary(["OCCUPIED", "OCCUPIED", "VACANT"]);
    expect(result.occupancyRate).toBe(67);
  });

  it("MAINTENANCE and RESERVED units count toward total but neither occupied nor vacant", () => {
    const result = computeOccupancySummary(["OCCUPIED", "MAINTENANCE", "RESERVED"]);
    expect(result).toEqual({ total: 3, occupied: 1, vacant: 0, occupancyRate: 33 });
  });

  it("returns a zero rate (never NaN) for an empty portfolio", () => {
    const result = computeOccupancySummary([]);
    expect(result).toEqual({ total: 0, occupied: 0, vacant: 0, occupancyRate: 0 });
  });

  it("is 100% when every unit is occupied", () => {
    const result = computeOccupancySummary(["OCCUPIED", "OCCUPIED"]);
    expect(result.occupancyRate).toBe(100);
  });
});
