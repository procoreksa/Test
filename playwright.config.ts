import { defineConfig } from "@playwright/test";

/**
 * Mobile-responsive regression suite (docs/MOBILE-RESPONSIVE.md). Runs
 * against a real production build (`npm run build && npm run start`),
 * never `next dev`, matching this project's established browser-
 * verification convention. Uses the sandbox's pre-installed Chromium
 * rather than downloading one.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3100",
    launchOptions: {
      executablePath: "/opt/pw-browsers/chromium",
    },
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: { storageState: "playwright/.auth/user.json" },
    },
  ],
  webServer: {
    command: "npm run start",
    env: { PORT: "3100" },
    url: "http://localhost:3100/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
