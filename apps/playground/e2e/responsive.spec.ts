import { test, expect } from '@playwright/test';

const BASE = '/omni-compress';

test.describe('Responsive Layout', () => {
  test('page renders on mobile (375px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    // User cannot scroll horizontally (overflow-x is hidden via CSS)
    const canScrollHorizontally = await page.evaluate(() => {
      window.scrollBy(100, 0);
      const scrolled = window.scrollX > 0;
      window.scrollBy(-100, 0);
      return scrolled;
    });
    expect(canScrollHorizontally).toBe(false);
    // Core UI is visible
    await expect(page.getByText(/drag.*drop|upload|choose.*file/i).first()).toBeVisible();
  });

  test('page renders on tablet (768px)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    const canScrollHorizontally = await page.evaluate(() => {
      window.scrollBy(100, 0);
      const scrolled = window.scrollX > 0;
      window.scrollBy(-100, 0);
      return scrolled;
    });
    expect(canScrollHorizontally).toBe(false);
    await expect(page.getByText(/drag.*drop|upload|choose.*file/i).first()).toBeVisible();
  });

  test('page is usable on desktop (1440px)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(BASE);
    await expect(page.getByText(/drag.*drop|upload|choose.*file/i).first()).toBeVisible();
  });
});
