import { describe, it, expect } from "vitest";
import { shouldRevalidateSession, SESSION_REVALIDATE_INTERVAL_MS } from "./auth-session-refresh";

describe("shouldRevalidateSession", () => {
  it("is true when verifiedAt is undefined (never verified yet)", () => {
    expect(shouldRevalidateSession(undefined)).toBe(true);
  });

  it("is false immediately after verification", () => {
    const now = new Date("2027-01-01T00:00:00Z");
    expect(shouldRevalidateSession(now.getTime(), now)).toBe(false);
  });

  it("is false just under the revalidation interval", () => {
    const verifiedAt = new Date("2027-01-01T00:00:00Z").getTime();
    const now = new Date(verifiedAt + SESSION_REVALIDATE_INTERVAL_MS - 1);
    expect(shouldRevalidateSession(verifiedAt, now)).toBe(false);
  });

  it("is true once the revalidation interval has fully elapsed", () => {
    const verifiedAt = new Date("2027-01-01T00:00:00Z").getTime();
    const now = new Date(verifiedAt + SESSION_REVALIDATE_INTERVAL_MS);
    expect(shouldRevalidateSession(verifiedAt, now)).toBe(true);
  });

  it("is true long after the interval has elapsed", () => {
    const verifiedAt = new Date("2027-01-01T00:00:00Z").getTime();
    const now = new Date(verifiedAt + SESSION_REVALIDATE_INTERVAL_MS * 100);
    expect(shouldRevalidateSession(verifiedAt, now)).toBe(true);
  });
});
