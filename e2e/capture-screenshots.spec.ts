import { test } from "@playwright/test";

/**
 * Ad-hoc visual-validation capture (Phase 9) - not part of the regression
 * suite's assertions, just produces screenshots for human review. Reuses
 * the same authenticated storageState as mobile-responsive.spec.ts.
 */
test.describe("Visual validation screenshots", () => {
  test("units page - iPhone AR (RTL), iPhone EN, desktop", async ({ page, context }) => {
    await context.addCookies([{ name: "locale", value: "ar", url: "http://localhost:3100" }]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/units");
    await page.waitForSelector("h1");
    await page.screenshot({ path: "e2e/screenshots/units-iphone-ar-after.png", fullPage: true });

    await context.addCookies([{ name: "locale", value: "en", url: "http://localhost:3100" }]);
    await page.goto("/units");
    await page.waitForSelector("h1");
    await page.screenshot({ path: "e2e/screenshots/units-iphone-en-after.png", fullPage: true });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/units");
    await page.waitForSelector("h1");
    await page.screenshot({ path: "e2e/screenshots/units-desktop-en-after.png", fullPage: true });

    await context.addCookies([{ name: "locale", value: "ar", url: "http://localhost:3100" }]);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/dashboard");
    const openButton = page.getByRole("button", { name: /القائمة|فتح/i }).first();
    await openButton.click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: "e2e/screenshots/mobile-nav-ar-open.png", fullPage: false });
  });
});
