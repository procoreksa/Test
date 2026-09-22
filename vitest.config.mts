import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Minimal test setup for the RBAC permission matrix (see docs/PERMISSIONS.md).
// Deliberately scoped to unit + light integration tests of permissions.ts and
// the server actions' authorization gate - not a full app test-suite migration.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Real, database-backed tests (src/**/*.db.test.ts) truncate tables and
    // must only ever run via `npm run test:db` against the disposable
    // database in .env.test - never as part of the default `npm test` run.
    // See vitest.db.config.mts and docs/AUDIT-AND-FINANCIAL-CONTROLS.md.
    exclude: ["**/node_modules/**", "src/**/*.db.test.ts"],
  },
});
