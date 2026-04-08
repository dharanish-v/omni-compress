import { test, expect } from '@playwright/test';

const BASE = '/omni-compress';

test.describe('Navigation & Home Page', () => {
  test('home page loads and shows the upload zone', async ({ page }) => {
    await page.goto(BASE);
    await expect(page).toHaveTitle(/omni-compress/i);
    // Upload zone should be visible
    await expect(page.getByText(/drag.*drop|upload|choose.*file/i).first()).toBeVisible();
  });

  test('home page has no console errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    // Filter out known non-critical messages (service worker, SharedArrayBuffer, blocked SW)
    const critical = errors.filter(
      (e) =>
        !e.includes('coi-serviceworker') &&
        !e.includes('SharedArrayBuffer') &&
        !e.includes('service-worker') &&
        !e.includes('ServiceWorker'),
    );
    expect(critical).toHaveLength(0);
  });

  test('navigates to a theme route', async ({ page }) => {
    await page.goto(`${BASE}/ja`);
    await expect(page).toHaveURL(`${BASE}/ja`);
    // Page should still show upload zone
    await expect(page.getByText(/drag.*drop|upload|choose.*file/i).first()).toBeVisible();
  });

  test('index redirects or renders without 404', async ({ page }) => {
    const response = await page.goto(BASE);
    expect(response?.status()).not.toBe(404);
  });
});
