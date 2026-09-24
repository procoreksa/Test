import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { sumDecimal, safeRate, serializeMoney } from "@/lib/executive/format";

describe("sumDecimal", () => {
  it("sums using Decimal arithmetic, never native float addition", () => {
    const result = sumDecimal([new Prisma.Decimal("0.1"), new Prisma.Decimal("0.2")]);
    expect(result.toString()).toBe("0.3");
  });

  it("returns zero for an empty list", () => {
    expect(sumDecimal([]).toString()).toBe("0");
  });
});

describe("safeRate", () => {
  it("returns 0 (never NaN/Infinity) when the denominator is zero or negative", () => {
    expect(safeRate(5, 0)).toBe(0);
    expect(safeRate(5, -1)).toBe(0);
  });

  it("rounds to the nearest whole percent", () => {
    expect(safeRate(1, 3)).toBe(33);
    expect(safeRate(2, 3)).toBe(67);
    expect(safeRate(50, 100)).toBe(50);
  });
});

describe("serializeMoney", () => {
  it("always renders two decimal places as a string", () => {
    expect(serializeMoney(new Prisma.Decimal("100"))).toBe("100.00");
    expect(serializeMoney(new Prisma.Decimal("99.999"))).toBe("100.00");
    expect(serializeMoney(0)).toBe("0.00");
  });
});
