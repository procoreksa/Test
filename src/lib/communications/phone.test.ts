import { describe, it, expect } from "vitest";
import { toE164 } from "./phone";

describe("toE164", () => {
  it("formats a local Saudi number", () => {
    expect(toE164("0501234567")).toBe("+966501234567");
  });

  it("passes through an already-canonical international number", () => {
    expect(toE164("+966501234567")).toBe("+966501234567");
  });

  it("formats a bare subscriber number", () => {
    expect(toE164("501234567")).toBe("+966501234567");
  });
});
