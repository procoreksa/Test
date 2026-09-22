import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import dotenv from "dotenv";
import { assertSafeTestDatabaseUrl } from "./src/lib/test-db-guard";

// Real, database-backed tests (cross-tenant isolation, IDOR, audit
// immutability, financial regression - see docs/AUDIT-AND-FINANCIAL-
// CONTROLS.md, "Cross-tenant DB testing strategy"). Deliberately kept out
// of the default `npm test`/vitest.config.mts run: these tests truncate
// tables and must only ever run against the disposable database named in
// .env.test, never a developer's or production's real database.
const testEnv = dotenv.config({ path: ".env.test" }).parsed ?? {};
assertSafeTestDatabaseUrl(testEnv.DATABASE_URL);

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.db.test.ts"],
    env: testEnv,
    globalSetup: ["./src/lib/actions/__dbtests__/global-setup.ts"],
    setupFiles: ["./src/lib/actions/__dbtests__/next-server-mocks.setup.ts"],
    // One worker: tests truncate shared tables between runs, so concurrent
    // files would stomp on each other's fixtures.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
