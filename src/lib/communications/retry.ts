/**
 * Retry policy: retryable-vs-permanent error classification, exponential
 * backoff scheduling, and the stuck-PROCESSING recovery threshold. Pure
 * functions over plain values (no DB/env/provider access) so the policy
 * itself - not any specific provider - is what gets unit tested.
 */

export type ProviderErrorClass = "RETRYABLE" | "PERMANENT";

/**
 * Provider-agnostic normalized error codes. A real provider adapter maps
 * its own vendor-specific error into one of these before it ever reaches
 * this module - this module never sees a vendor SDK error shape.
 */
const PERMANENT_ERROR_CODES = new Set([
  "INVALID_RECIPIENT",
  "TEMPLATE_REJECTED",
  "RECIPIENT_OPTED_OUT",
  "PROVIDER_AUTH_FAILED",
  "MESSAGE_TOO_LARGE",
]);

export function classifyProviderError(errorCode: string): ProviderErrorClass {
  return PERMANENT_ERROR_CODES.has(errorCode) ? "PERMANENT" : "RETRYABLE";
}

const BASE_DELAY_MS = 60_000; // 1 minute
const MAX_DELAY_MS = 60 * 60_000; // 1 hour cap

/** Exponential backoff: 1m, 2m, 4m, 8m, ... capped at 1h. `attemptNumber` is 1-based (the attempt that just failed). */
export function computeBackoffDelayMs(attemptNumber: number): number {
  const delay = BASE_DELAY_MS * Math.pow(2, Math.max(attemptNumber - 1, 0));
  return Math.min(delay, MAX_DELAY_MS);
}

export function computeNextAttemptAt(attemptNumber: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + computeBackoffDelayMs(attemptNumber));
}

export function hasExceededMaxAttempts(attemptCount: number, maxAttempts: number): boolean {
  return attemptCount >= maxAttempts;
}

const STUCK_PROCESSING_THRESHOLD_MS = 5 * 60_000; // 5 minutes

/**
 * True once a row claimed by a worker (status PROCESSING, claimedAt set)
 * has been claimed for longer than a normal provider call could plausibly
 * take - the worker that claimed it crashed or was killed mid-send. The
 * next processor run recovers it back to QUEUED (see status.ts,
 * PROCESSING -> QUEUED) rather than leaving it stuck forever.
 */
export function isStuckProcessing(claimedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - claimedAt.getTime() > STUCK_PROCESSING_THRESHOLD_MS;
}

export { STUCK_PROCESSING_THRESHOLD_MS };
