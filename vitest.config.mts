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
  },
});
