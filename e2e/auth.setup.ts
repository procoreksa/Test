import { test as setup } from "@playwright/test";

/**
 * Logs in exactly once and saves the authenticated storage state for reuse
 * by every other test in the suite - this codebase has DB-backed login
 * rate limiting (max 10 attempts per identifier per 15 minutes,
 * src/lib/rate-limit.ts), so a fresh login per test would legitimately trip
 * it well before this suite finishes.
 */
setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', "admin@demo-realestate.sa");
  await page.fill('input[name="password"]', "Passw0rd!");
  await page.click('button[type="submit"], form button');
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
  await page.context().storageState({ path: "playwright/.auth/user.json" });
});
