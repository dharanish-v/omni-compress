import { test, expect } from '@playwright/test';

const BASE = '/omni-compress';

test.describe('Responsive Layout', () => {
  test('no horizontal scrollbar on mobile (375px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');

    // Check for an actual horizontal scrollbar rather than raw scrollWidth,
    // which can be inflated by CSS box-shadow paint area in Chromium.
    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalScroll).toBe(false);
  });

  test('no horizontal scrollbar on tablet (768px)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');

    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalScroll).toBe(false);
  });

  test('page is usable on desktop (1440px)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE);
    await expect(page.getByText(/drag.*drop|upload|choose.*file/i).first()).toBeVisible();
  });
});
