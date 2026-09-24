/**
 * Centralized production environment validation (Prompt 23 Step 3-4,
 * Critical Rule 3 - fail closed). Only genuinely-required variables for a
 * production deployment are checked here - this is deliberately not "list
 * every env var the app reads": checking an optional, feature-gated
 * variable (`ZATCA_*`) at startup would falsely fail a production
 * deployment that legitimately hasn't turned that feature on yet.
 *
 * Pure and injectable (`env` parameter defaults to `process.env` but a
 * caller/test can pass a fake object) so it's directly unit-testable with
 * no process-wide env mutation. Never called at module-load time anywhere
 * in this codebase - see src/instrumentation.ts for the one runtime call
 * site, which fires once per server start (not during `prisma generate`/
 * `next build`'s static analysis, and not under `vitest`).
 */

export interface EnvValidationIssue {
  variable: string;
  message: string;
}

export interface EnvValidationResult {
  ok: boolean;
  issues: EnvValidationIssue[];
}

const PLACEHOLDER_SECRET_VALUES = new Set(["replace-with-a-random-32-byte-secret", ""]);
const MIN_SECRET_LENGTH = 16;

function isWeakSecret(value: string | undefined): boolean {
  if (!value) return true;
  if (PLACEHOLDER_SECRET_VALUES.has(value)) return true;
  return value.length < MIN_SECRET_LENGTH;
}

const REQUIRED_S3_VARS = [
  "DOCUMENT_S3_ENDPOINT",
  "DOCUMENT_S3_REGION",
  "DOCUMENT_S3_BUCKET",
  "DOCUMENT_S3_ACCESS_KEY_ID",
  "DOCUMENT_S3_SECRET_ACCESS_KEY",
] as const;

/**
 * Validates the subset of environment variables genuinely required for
 * THIS application to run safely in production. Returns a structured
 * result rather than throwing directly, so a caller can decide how loudly
 * to fail (the production runtime caller throws via
 * assertValidProductionEnvironment(); a test asserts on the result
 * directly).
 */
export function validateProductionEnvironment(env: Record<string, string | undefined> = process.env): EnvValidationResult {
  const issues: EnvValidationIssue[] = [];

  if (!env.DATABASE_URL) issues.push({ variable: "DATABASE_URL", message: "DATABASE_URL is required." });
  if (!env.DIRECT_URL) issues.push({ variable: "DIRECT_URL", message: "DIRECT_URL is required (used by `prisma migrate deploy`)." });

  if (isWeakSecret(env.AUTH_SECRET)) {
    issues.push({
      variable: "AUTH_SECRET",
      message: "AUTH_SECRET must be a real random secret (not the .env.example placeholder, at least 16 characters).",
    });
  }

  if (isWeakSecret(env.AUTOMATION_WORKER_SECRET)) {
    issues.push({
      variable: "AUTOMATION_WORKER_SECRET",
      message: "AUTOMATION_WORKER_SECRET must be a real random secret before the automation worker routes can be safely exposed.",
    });
  }

  // Critical Rule 3/5 - fail closed: production must never silently fall
  // back to the filesystem-backed LOCAL_DEV storage adapter. Either all
  // five DOCUMENT_S3_* variables are present (S3_COMPATIBLE becomes the
  // active provider - see src/lib/documents/providers/factory.ts), or this
  // is a hard misconfiguration, never a silent downgrade.
  const presentS3Vars = REQUIRED_S3_VARS.filter((key) => !!env[key]);
  if (presentS3Vars.length > 0 && presentS3Vars.length < REQUIRED_S3_VARS.length) {
    const missing = REQUIRED_S3_VARS.filter((key) => !env[key]);
    issues.push({
      variable: "DOCUMENT_S3_*",
      message: `Partial S3 storage configuration: missing ${missing.join(", ")}. All five DOCUMENT_S3_* variables must be set together.`,
    });
  }
  if (presentS3Vars.length === 0) {
    issues.push({
      variable: "DOCUMENT_S3_*",
      message:
        "No DOCUMENT_S3_* variables are set - production would fall back to the non-production LOCAL_DEV storage adapter. Set all five DOCUMENT_S3_* variables before serving real production traffic.",
    });
  }

  // COMMUNICATIONS_WORKER_SECRET / ADMIN_SEED_SECRET are deliberately NOT
  // hard-required here: an organization that hasn't wired a real
  // Communications provider yet, or never intends to expose the seed
  // endpoint in production, isn't broken by leaving them unset - each
  // route already fails closed on its own (isAuthorizedWorkerRequest()
  // returns false for an unset secret), so there is no silent-insecure
  // state at startup to catch for either of those two.

  return { ok: issues.length === 0, issues };
}

export class ProductionEnvironmentError extends Error {
  constructor(public readonly issues: EnvValidationIssue[]) {
    super(`Invalid production environment configuration:\n${issues.map((i) => `  - ${i.variable}: ${i.message}`).join("\n")}`);
    this.name = "ProductionEnvironmentError";
  }
}

/**
 * Throws ProductionEnvironmentError when running with `NODE_ENV=production`
 * and the configuration is invalid. A complete no-op outside production
 * (development/test keep working with whatever partial configuration they
 * already have).
 */
export function assertValidProductionEnvironment(env: Record<string, string | undefined> = process.env): void {
  if (env.NODE_ENV !== "production") return;
  const result = validateProductionEnvironment(env);
  if (!result.ok) throw new ProductionEnvironmentError(result.issues);
}
