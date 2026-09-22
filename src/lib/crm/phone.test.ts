import { describe, it, expect } from "vitest";
import { normalizeSaudiMobile, isSameMobile } from "./phone";

describe("normalizeSaudiMobile", () => {
  it("normalizes local, international-plus, and international-plain formats to the same value", () => {
    expect(normalizeSaudiMobile("0501234567")).toBe("966501234567");
    expect(normalizeSaudiMobile("+966501234567")).toBe("966501234567");
    expect(normalizeSaudiMobile("966501234567")).toBe("966501234567");
  });

  it("strips spaces and dashes before normalizing", () => {
    expect(normalizeSaudiMobile("050-123 4567")).toBe("966501234567");
    expect(normalizeSaudiMobile("+966 50 123 4567")).toBe("966501234567");
  });

  it("normalizes a bare 9-digit subscriber number starting with 5", () => {
    expect(normalizeSaudiMobile("501234567")).toBe("966501234567");
  });

  it("does not misinterpret a non-Saudi-shaped number, just strips formatting", () => {
    expect(normalizeSaudiMobile("+1 555-123-4567")).toBe("15551234567");
  });
});

describe("isSameMobile", () => {
  it("treats all three example formats from the brief as the same number", () => {
    expect(isSameMobile("0501234567", "+966501234567")).toBe(true);
    expect(isSameMobile("+966501234567", "966501234567")).toBe(true);
    expect(isSameMobile("0501234567", "966501234567")).toBe(true);
  });

  it("returns false for genuinely different numbers", () => {
    expect(isSameMobile("0501234567", "0559876543")).toBe(false);
  });

  it("returns false when either side is empty", () => {
    expect(isSameMobile("", "0501234567")).toBe(false);
    expect(isSameMobile("0501234567", "")).toBe(false);
  });
});
