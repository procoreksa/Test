import { prisma } from "@/lib/prisma";
import {
  hashRateLimitKey,
  windowStartFor,
  isOverLimit,
  LOGIN_RATE_LIMIT_WINDOW_MS,
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IDENTIFIER,
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP,
} from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/logging";

export type LoginPrincipalType = "INTERNAL" | "TENANT" | "OWNER";

/**
 * A single atomic upsert per bucket - `attemptCount: { increment: 1 }` is
 * translated by Prisma into one `INSERT ... ON CONFLICT DO UPDATE SET
 * "attemptCount" = "attemptCount" + 1` statement, which Postgres executes
 * as a single row-level-locked operation. Two concurrent requests hitting
 * the same (bucketKey, windowStart) can never read-then-write past each
 * other - there is no separate read step to race.
 */
async function incrementBucket(bucketKey: string, windowStart: Date): Promise<number> {
  const row = await prisma.loginRateLimitEntry.upsert({
    where: { bucketKey_windowStart: { bucketKey, windowStart } },
    create: { bucketKey, windowStart, attemptCount: 1 },
    update: { attemptCount: { increment: 1 } },
  });
  return row.attemptCount;
}

/**
 * The single gate every one of the 3 login paths (internal `authorize()`,
 * `verifyTenantCredentials()`, `verifyOwnerCredentials()) calls FIRST,
 * before touching the database for the account itself or calling
 * `bcrypt.compare()` - a throttled attempt never reaches the password
 * check at all, so the rate limiter itself never becomes a second timing
 * side-channel.
 *
 * Two independent buckets are checked, and either one tripping is enough
 * to reject the attempt:
 *   - per-identifier (hashed, normalized email) - stops many attempts
 *     against one account regardless of how many source IPs are used.
 *   - per-IP (only when an IP address is available/trustworthy) -
 *     stops one source hitting many accounts. Never blocks solely on a
 *     missing IP - `identifier-based throttling as fallback` per Step
 *     "trusted-proxy handling".
 *
 * Every attempt still increments its bucket even once already over the
 * limit (so a sustained attack doesn't quietly "reset" by staying exactly
 * at the threshold) - the fixed window itself is the only reset
 * mechanism, once `windowStart` advances.
 */
export async function checkAndRecordLoginAttempt(params: {
  principalType: LoginPrincipalType;
  identifier: string;
  ipAddress: string | null;
  now?: Date;
}): Promise<{ limited: boolean }> {
  const now = params.now ?? new Date();
  const windowStart = windowStartFor(now, LOGIN_RATE_LIMIT_WINDOW_MS);
  const normalizedIdentifier = params.identifier.toLowerCase().trim();

  const identifierBucketKey = hashRateLimitKey(["identifier", params.principalType, normalizedIdentifier]);
  const identifierCount = await incrementBucket(identifierBucketKey, windowStart);
  let limited = isOverLimit(identifierCount, LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IDENTIFIER);

  if (params.ipAddress) {
    const ipBucketKey = hashRateLimitKey(["ip", params.principalType, params.ipAddress]);
    const ipCount = await incrementBucket(ipBucketKey, windowStart);
    if (isOverLimit(ipCount, LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP)) limited = true;
  }

  if (limited) {
    logSecurityEvent("login_rate_limit_triggered", { principalType: params.principalType });
  }

  return { limited };
}
