import { describe, it, expect } from "vitest";
import { hashRateLimitKey, windowStartFor, isOverLimit, LOGIN_RATE_LIMIT_WINDOW_MS } from "./rate-limit";

describe("hashRateLimitKey", () => {
  it("is deterministic for the same input", () => {
    expect(hashRateLimitKey(["identifier", "INTERNAL", "a@b.com"])).toBe(hashRateLimitKey(["identifier", "INTERNAL", "a@b.com"]));
  });

  it("produces different digests for different inputs", () => {
    expect(hashRateLimitKey(["identifier", "INTERNAL", "a@b.com"])).not.toBe(hashRateLimitKey(["identifier", "INTERNAL", "c@d.com"]));
  });

  it("never returns the raw input itself", () => {
    const result = hashRateLimitKey(["identifier", "INTERNAL", "secret@example.com"]);
    expect(result).not.toContain("secret@example.com");
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("distinguishes principal types for the same identifier value", () => {
    expect(hashRateLimitKey(["identifier", "INTERNAL", "same@x.com"])).not.toBe(hashRateLimitKey(["identifier", "TENANT", "same@x.com"]));
  });
});

describe("windowStartFor", () => {
  it("floors a timestamp to the start of its fixed window", () => {
    const now = new Date("2026-01-01T10:07:23.000Z");
    const start = windowStartFor(now, LOGIN_RATE_LIMIT_WINDOW_MS);
    expect(start.toISOString()).toBe("2026-01-01T10:00:00.000Z");
  });

  it("maps two timestamps in the same window to the same start", () => {
    const a = windowStartFor(new Date("2026-01-01T10:00:00.001Z"), LOGIN_RATE_LIMIT_WINDOW_MS);
    const b = windowStartFor(new Date("2026-01-01T10:14:59.999Z"), LOGIN_RATE_LIMIT_WINDOW_MS);
    expect(a.getTime()).toBe(b.getTime());
  });

  it("maps timestamps in adjacent windows to different starts", () => {
    const a = windowStartFor(new Date("2026-01-01T10:14:59.999Z"), LOGIN_RATE_LIMIT_WINDOW_MS);
    const b = windowStartFor(new Date("2026-01-01T10:15:00.000Z"), LOGIN_RATE_LIMIT_WINDOW_MS);
    expect(a.getTime()).not.toBe(b.getTime());
  });
});

describe("isOverLimit", () => {
  it("is false at exactly the max (the max attempt itself is allowed)", () => {
    expect(isOverLimit(10, 10)).toBe(false);
  });

  it("is true one past the max", () => {
    expect(isOverLimit(11, 10)).toBe(true);
  });

  it("is false well under the max", () => {
    expect(isOverLimit(1, 10)).toBe(false);
  });
});
