/**
 * Lightweight structured logging (Prompt 23 Steps 31-33). Deliberately not
 * a logging framework/library - a single `log()` function that writes one
 * JSON line per event to stdout/stderr (whatever the hosting platform
 * already captures - see docs/PRODUCTION-DEPLOYMENT.md §9/§12), with
 * built-in, centralized, case-insensitive redaction of anything
 * secret-shaped before it's ever serialized. Field shape is deliberately
 * narrow (timestamp/level/event/small context object) - "just enough to
 * investigate an incident from logs alone," never a distributed-tracing
 * system, and never per-request-body/PII logging.
 */

const SENSITIVE_KEY_PATTERN =
  /(password|secret|token|authorization|cookie|accesskey|secretaccesskey|databaseurl|apikey|credential)/i;
const REDACTED = "[REDACTED]";

// Defense-in-depth (Step 32): even a value under an innocuous-looking key
// can accidentally carry a connection string or an AWS-shaped access key
// (e.g. a Postgres error message that echoes its own connection string) -
// scrubbed by pattern, not just by key name.
const CONNECTION_STRING_CREDENTIALS = /:\/\/[^:/\s@]+:[^@/\s]+@/g;
const AWS_ACCESS_KEY_ID_PATTERN = /\bAKIA[0-9A-Z]{16}\b/g;

function scrubString(value: string): string {
  return value.replace(CONNECTION_STRING_CREDENTIALS, "://[REDACTED]@").replace(AWS_ACCESS_KEY_ID_PATTERN, REDACTED);
}

/**
 * Recursively redacts a value: any object key matching the sensitive-key
 * pattern is replaced with `[REDACTED]` regardless of its own value's
 * shape (an object/array under a `token` key is fully dropped, not
 * recursed into); every string value (including ones under a safe key
 * name) is separately scrubbed for connection-string/AWS-key shapes.
 * Exported directly so it's independently unit-testable without going
 * through the log-writing side effect.
 */
export function redact(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, seen));
  if (typeof value === "object") {
    if (seen.has(value as object)) return "[CIRCULAR]";
    seen.add(value as object);
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redact(val, seen);
    }
    return out;
  }
  return value;
}

export type LogLevel = "info" | "warn" | "error";

export interface LogContext {
  requestId?: string;
  organizationId?: string;
  principalType?: string;
  jobId?: string;
  outboxEventId?: string;
  messageId?: string;
  errorCode?: string;
  correlationId?: string;
  [key: string]: unknown;
}

function write(level: LogLevel, event: string, context?: LogContext): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export function logInfo(event: string, context?: LogContext): void {
  write("info", event, context);
}

export function logWarn(event: string, context?: LogContext): void {
  write("warn", event, context);
}

/**
 * The one place an unexpected-error catch block should report - never
 * `console.error(error)` directly (that would print the raw Error object,
 * including its full stack, straight into logs meant for ordinary
 * operators - Critical Rule 4). Only the error's own name/message
 * (redacted like everything else) is recorded, never `error.stack`.
 */
export function logError(event: string, error: unknown, context?: LogContext): void {
  const errorInfo = error instanceof Error ? { errorName: error.name, errorMessage: error.message } : { errorMessage: String(error) };
  write("error", event, { ...context, ...errorInfo });
}

/**
 * Security-relevant events worth a dedicated, greppable call site (Step
 * 33): rate limiting triggered, worker-auth rejected, production-config
 * invalid, storage failure, job-backlog threshold, unexpected
 * authorization failure. Deliberately NOT called for every successful
 * permission check - only for something an operator should be able to
 * search logs for after the fact.
 */
export function logSecurityEvent(event: string, context?: LogContext): void {
  write("warn", `security.${event}`, context);
}
