import { createHash } from "crypto";

/**
 * Pure helpers behind login rate limiting (Prompt 23 Step "login rate
 * limiting"/"rate-limit keys"). Kept free of any Prisma/Next import so
 * they're directly unit-testable, deterministic given an injected `now`,
 * and reusable by whichever DB-backed limiter (src/lib/login-rate-
 * limiter.ts) actually persists the counters.
 */

/** Fixed window (not sliding) - simple, and adequate for slowing down brute-force/credential-stuffing without a shared cache. */
export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** Per-identifier (email) cap - catches many attempts against one account regardless of source IP. */
export const LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IDENTIFIER = 10;

/** Per-IP cap, only applied when an IP address is available - catches one source hitting many accounts. Higher than the per-identifier cap since a shared office/NAT IP can legitimately produce more distinct login attempts. */
export const LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP = 30;

/**
 * Never stores a raw email or IP address in the rate-limit table itself
 * (Step "rate-limit keys" - "avoid unnecessary raw PII storage"). A SHA-256
 * digest of the composite `${kind}:${principalType}:${value}` string -
 * deterministic (so the same identifier always maps to the same bucket)
 * but not reversible from the stored value alone.
 */
export function hashRateLimitKey(parts: string[]): string {
  return createHash("sha256").update(parts.join(":")).digest("hex");
}

/** Floors `now` to the start of its fixed window - e.g. with a 15-minute window, 10:07 and 10:14 both map to 10:00. */
export function windowStartFor(now: Date, windowMs: number): Date {
  const epoch = now.getTime();
  return new Date(epoch - (epoch % windowMs));
}

export function isOverLimit(count: number, max: number): boolean {
  return count > max;
}
