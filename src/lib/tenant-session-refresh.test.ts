import { describe, it, expect } from "vitest";
import { shouldRevalidateTenantSession, TENANT_SESSION_REVALIDATE_INTERVAL_MS } from "./tenant-session-refresh";

describe("shouldRevalidateTenantSession", () => {
  it("is true when verifiedAt is undefined (never verified yet)", () => {
    expect(shouldRevalidateTenantSession(undefined)).toBe(true);
  });

  it("is false immediately after verification", () => {
    const now = new Date("2027-01-01T00:00:00Z");
    expect(shouldRevalidateTenantSession(now.getTime(), now)).toBe(false);
  });

  it("is false just under the revalidation interval", () => {
    const verifiedAt = new Date("2027-01-01T00:00:00Z").getTime();
    const now = new Date(verifiedAt + TENANT_SESSION_REVALIDATE_INTERVAL_MS - 1);
    expect(shouldRevalidateTenantSession(verifiedAt, now)).toBe(false);
  });

  it("is true once the revalidation interval has fully elapsed", () => {
    const verifiedAt = new Date("2027-01-01T00:00:00Z").getTime();
    const now = new Date(verifiedAt + TENANT_SESSION_REVALIDATE_INTERVAL_MS);
    expect(shouldRevalidateTenantSession(verifiedAt, now)).toBe(true);
  });

  it("is true long after the interval has elapsed", () => {
    const verifiedAt = new Date("2027-01-01T00:00:00Z").getTime();
    const now = new Date(verifiedAt + TENANT_SESSION_REVALIDATE_INTERVAL_MS * 100);
    expect(shouldRevalidateTenantSession(verifiedAt, now)).toBe(true);
  });
});
