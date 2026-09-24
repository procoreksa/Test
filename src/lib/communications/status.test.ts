import { describe, it, expect } from "vitest";
import { isValidStatusTransition, assertValidStatusTransition } from "./status";

describe("isValidStatusTransition", () => {
  it("allows the full happy path", () => {
    expect(isValidStatusTransition("QUEUED", "PROCESSING")).toBe(true);
    expect(isValidStatusTransition("PROCESSING", "SENT")).toBe(true);
    expect(isValidStatusTransition("SENT", "DELIVERED")).toBe(true);
    expect(isValidStatusTransition("DELIVERED", "READ")).toBe(true);
  });

  it("allows PROCESSING -> FAILED and PROCESSING -> QUEUED (stuck recovery)", () => {
    expect(isValidStatusTransition("PROCESSING", "FAILED")).toBe(true);
    expect(isValidStatusTransition("PROCESSING", "QUEUED")).toBe(true);
  });

  it("allows manual retry FAILED -> QUEUED", () => {
    expect(isValidStatusTransition("FAILED", "QUEUED")).toBe(true);
  });

  it("allows cancelling only while QUEUED", () => {
    expect(isValidStatusTransition("QUEUED", "CANCELLED")).toBe(true);
    expect(isValidStatusTransition("PROCESSING", "CANCELLED")).toBe(false);
  });

  it("never marks SENT directly from QUEUED (Critical Principle 4)", () => {
    expect(isValidStatusTransition("QUEUED", "SENT")).toBe(false);
    expect(isValidStatusTransition("QUEUED", "DELIVERED")).toBe(false);
  });

  it("treats READ and CANCELLED as terminal", () => {
    expect(isValidStatusTransition("READ", "QUEUED")).toBe(false);
    expect(isValidStatusTransition("CANCELLED", "QUEUED")).toBe(false);
  });

  it("never allows SENT to regress to FAILED", () => {
    expect(isValidStatusTransition("SENT", "FAILED")).toBe(false);
  });
});

describe("assertValidStatusTransition", () => {
  it("does not throw for a valid transition", () => {
    expect(() => assertValidStatusTransition("QUEUED", "PROCESSING")).not.toThrow();
  });

  it("throws for an invalid transition", () => {
    expect(() => assertValidStatusTransition("QUEUED", "DELIVERED")).toThrow(/Invalid/);
  });
});
