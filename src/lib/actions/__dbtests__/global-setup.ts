import { execFileSync } from "node:child_process";
import dotenv from "dotenv";
import { assertSafeTestDatabaseUrl } from "@/lib/test-db-guard";

/**
 * Runs once before the whole real-DB test suite (see vitest.db.config.mts).
 * Loads .env.test independently (globalSetup runs in its own process,
 * separate from the worker processes that get vitest.config's `test.env`),
 * re-checks the safety guard (belt and suspenders: vitest.config itself
 * already checked at config-load time), and applies migrations to the test
 * database so it always starts from the current schema.
 */
export default async function globalSetup() {
  const testEnv = dotenv.config({ path: ".env.test" }).parsed ?? {};
  assertSafeTestDatabaseUrl(testEnv.DATABASE_URL);

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, ...testEnv },
  });
}
