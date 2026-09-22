/**
 * Guards the real-database test suite (vitest.db.config.mts) from ever
 * running against a production or shared database. These tests truncate
 * tables between runs, so a false positive here is a data-loss incident,
 * not just a bug.
 *
 * Checked, in order:
 *  1. DATABASE_URL must resolve (loaded from .env.test by the db test config).
 *  2. Host must be localhost/127.0.0.1 - never a managed cloud host.
 *  3. Host must not match a known managed-Postgres provider pattern, even on
 *     a non-standard port (defense in depth against a misconfigured .env.test).
 *  4. Database name must contain "test".
 *  5. The resolved test URL must differ from the app's own .env DATABASE_URL,
 *     read directly off disk so this check works independently of whichever
 *     .env file the process happened to load.
 *
 * See docs/AUDIT-AND-FINANCIAL-CONTROLS.md, "Cross-tenant DB testing
 * strategy", for the reasoning behind each check.
 */
import fs from "node:fs";
import path from "node:path";

const MANAGED_POSTGRES_HOST_PATTERNS = [
  /neon\.tech$/i,
  /amazonaws\.com$/i,
  /supabase\.co$/i,
  /azure\.com$/i,
  /database\.windows\.net$/i,
  /digitalocean\.com$/i,
  /render\.com$/i,
  /railway\.app$/i,
  /koyeb\.app$/i,
  /planetscale\.com$/i,
  /cockroachlabs\.cloud$/i,
];

function readDotEnvDatabaseUrl(filename: string): string | null {
  try {
    const filePath = path.resolve(process.cwd(), filename);
    const content = fs.readFileSync(filePath, "utf8");
    const match = content.match(/^DATABASE_URL\s*=\s*"?([^"\n]*)"?\s*$/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function assertSafeTestDatabaseUrl(rawUrl: string | undefined): asserts rawUrl is string {
  if (!rawUrl) {
    throw new Error(
      "DATABASE_URL is not set. Real DB tests require .env.test to be loaded (see vitest.db.config.mts)."
    );
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`DATABASE_URL is not a valid connection string: ${rawUrl}`);
  }

  const host = url.hostname.toLowerCase();
  const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!isLocalHost) {
    throw new Error(
      `Refusing to run destructive DB tests: DATABASE_URL host "${host}" is not localhost. ` +
        "These tests truncate tables and must only run against a local, disposable test database."
    );
  }

  if (MANAGED_POSTGRES_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
    throw new Error(
      `Refusing to run destructive DB tests: DATABASE_URL host "${host}" matches a known managed-Postgres provider pattern.`
    );
  }

  const databaseName = url.pathname.replace(/^\//, "");
  if (!databaseName.toLowerCase().includes("test")) {
    throw new Error(
      `Refusing to run destructive DB tests: database name "${databaseName}" does not contain "test". ` +
        'Point DATABASE_URL (via .env.test) at a database whose name contains "test", e.g. rental_saas_test.'
    );
  }

  const mainAppUrl = readDotEnvDatabaseUrl(".env");
  if (mainAppUrl && mainAppUrl.trim() === rawUrl.trim()) {
    throw new Error(
      "Refusing to run destructive DB tests: DATABASE_URL is identical to the main .env DATABASE_URL. " +
        "Real DB tests must use a separate, disposable database."
    );
  }
}
