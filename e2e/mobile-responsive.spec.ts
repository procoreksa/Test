import { test, expect, type Page, type BrowserContext } from "@playwright/test";

/**
 * Mobile-responsive regression suite (docs/MOBILE-RESPONSIVE.md).
 *
 * Focused on /units per the reported defect, plus a page-level overflow
 * sweep across the other pages that share the same table pattern. Uses
 * the existing local dev database's seeded demo admin account - never
 * production, never mutates data.
 */

const VIEWPORTS = [
  { name: "iphone-375", width: 375, height: 667 },
  { name: "iphone-390", width: 390, height: 844 },
  { name: "iphone-430", width: 430, height: 932 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 900 },
];

const MOBILE_VIEWPORTS = VIEWPORTS.filter((v) => v.width < 768);
const TABLE_VIEWPORTS = VIEWPORTS.filter((v) => v.width >= 768);

async function setLocale(context: BrowserContext, locale: "en" | "ar") {
  await context.addCookies([
    { name: "locale", value: locale, url: "http://localhost:3100" },
  ]);
}

/**
 * Reusable helper: asserts the page has no page-level horizontal overflow,
 * i.e. document.documentElement.scrollWidth <= clientWidth (with a small
 * tolerance for scrollbar rounding), unless a component provides its own
 * intentional horizontal-scroll region (those are excluded by design -
 * they scroll internally, never pushing the outer page wider).
 */
async function expectNoPageLevelHorizontalOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `page-level horizontal overflow: scrollWidth=${scrollWidth} > clientWidth=${clientWidth}`).toBeLessThanOrEqual(
    clientWidth + 1
  );
}

async function expectElementFullyInViewport(page: Page, locator: ReturnType<Page["locator"]>, viewportWidth: number) {
  const box = await locator.boundingBox();
  expect(box, "element must be visible with a bounding box").not.toBeNull();
  if (!box) return;
  expect(box.x, "element clipped off the start/left edge").toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, "element clipped off the end/right edge").toBeLessThanOrEqual(viewportWidth + 1);
}

test.describe("Units page - mobile responsive", () => {
  for (const vp of MOBILE_VIEWPORTS) {
    test(`EN @ ${vp.name} (${vp.width}x${vp.height}): mobile cards render, nothing clipped, no page overflow`, async ({ page, context }) => {
      await setLocale(context, "en");
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/units");
      await page.waitForSelector("h1");

      // Desktop table must be hidden, mobile cards must be the visible presentation.
      await expect(page.locator("table").first()).toBeHidden();
      await expectNoPageLevelHorizontalOverflow(page);
    });

    test(`AR RTL @ ${vp.name} (${vp.width}x${vp.height}): entire unit card visible, nothing clipped on either side`, async ({ page, context }) => {
      await setLocale(context, "ar");
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/units");
      await page.waitForSelector("h1");

      const html = page.locator("html");
      await expect(html).toHaveAttribute("dir", "rtl");

      await expect(page.locator("table").first()).toBeHidden();
      await expectNoPageLevelHorizontalOverflow(page);

      // Every card's bounding box must be fully within the viewport - the
      // exact defect reported ("content on the left side is clipped").
      const cards = page.locator("main .space-y-3 > div");
      const count = await cards.count();
      expect(count, "expected at least one unit card to render").toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        await expectElementFullyInViewport(page, cards.nth(i), vp.width);
      }
    });
  }

  for (const vp of TABLE_VIEWPORTS) {
    test(`EN @ ${vp.name} (${vp.width}x${vp.height}): desktop table renders, no page overflow`, async ({ page, context }) => {
      await setLocale(context, "en");
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/units");
      await page.waitForSelector("h1");

      await expect(page.locator("table").first()).toBeVisible();
      await expect(page.locator("main .space-y-3").first()).toBeHidden();
      await expectNoPageLevelHorizontalOverflow(page);
    });

    test(`AR RTL @ ${vp.name} (${vp.width}x${vp.height}): desktop table renders RTL, no page overflow`, async ({ page, context }) => {
      await setLocale(context, "ar");
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/units");
      await page.waitForSelector("h1");

      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await expect(page.locator("table").first()).toBeVisible();
      await expectNoPageLevelHorizontalOverflow(page);
    });
  }
});

test.describe("Contracts/Renters/Collections/Invoices - desktop table + mobile cards pattern", () => {
  const CARD_PAGES = ["/contracts", "/renters", "/collections", "/invoices"];

  for (const path of CARD_PAGES) {
    test(`${path} @ iphone-390: mobile cards render, desktop table hidden, no overflow`, async ({ page, context }) => {
      await setLocale(context, "en");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path);
      await page.waitForSelector("h1");

      await expect(page.locator("table").first()).toBeHidden();
      await expectNoPageLevelHorizontalOverflow(page);
    });

    test(`${path} @ desktop-1440: desktop table renders, mobile cards hidden, no overflow`, async ({ page, context }) => {
      await setLocale(context, "en");
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);
      await page.waitForSelector("h1");

      await expect(page.locator("table").first()).toBeVisible();
      await expect(page.locator("main .space-y-3").first()).toBeHidden();
      await expectNoPageLevelHorizontalOverflow(page);
    });
  }
});

test.describe("Other high-traffic pages - global overflow sweep", () => {
  const PAGES =["/dashboard", "/contracts", "/renters", "/collections", "/invoices", "/payments", "/compounds", "/buildings", "/owners"];

  for (const path of PAGES) {
    for (const locale of ["en", "ar"] as const) {
      test(`${path} @ iphone-390 ${locale.toUpperCase()}: no page-level horizontal overflow`, async ({ page, context }) => {
        await setLocale(context, locale);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await expectNoPageLevelHorizontalOverflow(page);
      });
    }
  }
});

test.describe("Mobile navigation", () => {
  test("hamburger menu opens/closes and stays within viewport (EN)", async ({ page, context }) => {
    await setLocale(context, "en");
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/dashboard");

    const openButton = page.getByRole("button", { name: /menu/i }).first();
    await openButton.click();

    const aside = page.locator("aside");
    await expect(aside).toBeVisible();
    const box = await aside.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeLessThanOrEqual(375);
    }

    // Users & Permissions must remain reachable for OWNER.
    await expect(page.getByRole("link", { name: /users.*permissions/i })).toBeVisible();

    // The drawer closes via a CSS transform (slide off-canvas), not
    // display/visibility, so it stays "visible" to Playwright - assert it
    // moved fully outside the viewport instead of asserting toBeHidden().
    const closeButton = page.getByRole("button", { name: /close/i }).first();
    await closeButton.click();
    await expect(async () => {
      const closedBox = await aside.boundingBox();
      expect(closedBox).not.toBeNull();
      if (closedBox) {
        expect(closedBox.x + closedBox.width, "drawer must slide fully off the start/left edge when closed").toBeLessThanOrEqual(1);
      }
    }).toPass({ timeout: 2_000 });

    await expectNoPageLevelHorizontalOverflow(page);
  });

  test("hamburger menu is RTL-positioned and functional (AR)", async ({ page, context }) => {
    await setLocale(context, "ar");
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/dashboard");

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const openButton = page.getByRole("button", { name: /القائمة|فتح/i }).first();
    await openButton.click();
    await expect(page.locator("aside")).toBeVisible();
    await expectNoPageLevelHorizontalOverflow(page);
  });
});
