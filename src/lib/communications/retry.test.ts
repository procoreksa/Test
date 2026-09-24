import { describe, it, expect } from "vitest";
import {
  classifyProviderError,
  computeBackoffDelayMs,
  computeNextAttemptAt,
  hasExceededMaxAttempts,
  isStuckProcessing,
} from "./retry";

describe("classifyProviderError", () => {
  it("classifies known permanent codes as PERMANENT", () => {
    expect(classifyProviderError("INVALID_RECIPIENT")).toBe("PERMANENT");
    expect(classifyProviderError("TEMPLATE_REJECTED")).toBe("PERMANENT");
  });

  it("classifies unknown/transient codes as RETRYABLE", () => {
    expect(classifyProviderError("TIMEOUT")).toBe("RETRYABLE");
    expect(classifyProviderError("PROVIDER_UNAVAILABLE")).toBe("RETRYABLE");
  });
});

describe("computeBackoffDelayMs", () => {
  it("doubles each attempt starting at 1 minute", () => {
    expect(computeBackoffDelayMs(1)).toBe(60_000);
    expect(computeBackoffDelayMs(2)).toBe(120_000);
    expect(computeBackoffDelayMs(3)).toBe(240_000);
  });

  it("caps at 1 hour", () => {
    expect(computeBackoffDelayMs(20)).toBe(60 * 60_000);
  });
});

describe("computeNextAttemptAt", () => {
  it("adds the backoff delay to the given time", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(computeNextAttemptAt(1, now).toISOString()).toBe("2026-01-01T00:01:00.000Z");
  });
});

describe("hasExceededMaxAttempts", () => {
  it("is false below the max and true at/after it", () => {
    expect(hasExceededMaxAttempts(4, 5)).toBe(false);
    expect(hasExceededMaxAttempts(5, 5)).toBe(true);
    expect(hasExceededMaxAttempts(6, 5)).toBe(true);
  });
});

describe("isStuckProcessing", () => {
  it("is false within the threshold", () => {
    const claimedAt = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date("2026-01-01T00:04:00.000Z");
    expect(isStuckProcessing(claimedAt, now)).toBe(false);
  });

  it("is true past the threshold", () => {
    const claimedAt = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date("2026-01-01T00:06:00.000Z");
    expect(isStuckProcessing(claimedAt, now)).toBe(true);
  });
});
