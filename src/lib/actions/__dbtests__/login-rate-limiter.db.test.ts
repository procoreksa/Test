/**
 * Real-database tests for login rate limiting (Prompt 23 - "rate-limit
 * real-DB concurrency test", "rate-limit expiry test"). Exercises the
 * actual Postgres-backed upsert path in src/lib/login-rate-limiter.ts -
 * not a mock - since the whole point of this design is that the atomic
 * increment is a real database guarantee, not an application-level lock.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { resetDatabase } from "./db-test-helpers";
import { checkAndRecordLoginAttempt } from "@/lib/login-rate-limiter";
import { prisma } from "@/lib/prisma";
import { LOGIN_RATE_LIMIT_WINDOW_MS, LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IDENTIFIER } from "@/lib/rate-limit";

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("checkAndRecordLoginAttempt - real-DB concurrency", () => {
  it("two concurrent attempts for the same identifier both increment the counter - neither is lost to a race", async () => {
    const identifier = "concurrent-test@example.com";
    const now = new Date("2026-06-01T10:00:00.000Z");

    const [first, second] = await Promise.all([
      checkAndRecordLoginAttempt({ principalType: "INTERNAL", identifier, ipAddress: "10.0.0.1", now }),
      checkAndRecordLoginAttempt({ principalType: "INTERNAL", identifier, ipAddress: "10.0.0.2", now }),
    ]);

    expect(first.limited).toBe(false);
    expect(second.limited).toBe(false);

    // If the increment weren't atomic, a lost update could leave this at 1
    // instead of 2 - both concurrent requests must be reflected.
    const rows = await prisma.loginRateLimitEntry.findMany();
    const identifierRow = rows.find((r) => r.attemptCount === 2);
    expect(identifierRow).toBeDefined();
  });

  it("a burst of concurrent attempts past the limit is counted exactly, with no double-counting or lost updates", async () => {
    const identifier = "burst-test@example.com";
    const now = new Date("2026-06-01T11:00:00.000Z");
    const attempts = LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IDENTIFIER + 5;

    const results = await Promise.all(
      Array.from({ length: attempts }, (_, i) =>
        checkAndRecordLoginAttempt({ principalType: "INTERNAL", identifier, ipAddress: `10.0.1.${i}`, now })
      )
    );

    const limitedCount = results.filter((r) => r.limited).length;
    // Exactly the attempts beyond the identifier cap should be flagged limited.
    expect(limitedCount).toBe(attempts - LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IDENTIFIER);
  });
});

describe("checkAndRecordLoginAttempt - fixed-window expiry", () => {
  it("blocks once the per-identifier limit is exceeded within a window, then allows again once the window advances", async () => {
    const identifier = "expiry-test@example.com";
    const windowOneStart = new Date("2026-07-01T00:00:00.000Z");

    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IDENTIFIER; i++) {
      const result = await checkAndRecordLoginAttempt({
        principalType: "INTERNAL",
        identifier,
        ipAddress: null,
        now: new Date(windowOneStart.getTime() + i * 1000),
      });
      expect(result.limited).toBe(false);
    }

    const stillInWindow = await checkAndRecordLoginAttempt({
      principalType: "INTERNAL",
      identifier,
      ipAddress: null,
      now: new Date(windowOneStart.getTime() + LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IDENTIFIER * 1000),
    });
    expect(stillInWindow.limited).toBe(true);

    // Time-injected, not wall-clock sleep: the next window starts exactly
    // LOGIN_RATE_LIMIT_WINDOW_MS after the fixed window boundary.
    const nextWindow = new Date(windowOneStart.getTime() + LOGIN_RATE_LIMIT_WINDOW_MS);
    const afterWindowExpiry = await checkAndRecordLoginAttempt({
      principalType: "INTERNAL",
      identifier,
      ipAddress: null,
      now: nextWindow,
    });
    expect(afterWindowExpiry.limited).toBe(false);
  });

  it("different principal types never share a bucket for the same email", async () => {
    const identifier = "shared-email@example.com";
    const now = new Date("2026-08-01T00:00:00.000Z");

    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IDENTIFIER; i++) {
      await checkAndRecordLoginAttempt({ principalType: "INTERNAL", identifier, ipAddress: null, now: new Date(now.getTime() + i) });
    }
    const internalLimited = await checkAndRecordLoginAttempt({ principalType: "INTERNAL", identifier, ipAddress: null, now });
    expect(internalLimited.limited).toBe(true);

    // TENANT's bucket for the same email address is untouched.
    const tenantResult = await checkAndRecordLoginAttempt({ principalType: "TENANT", identifier, ipAddress: null, now });
    expect(tenantResult.limited).toBe(false);
  });
});
