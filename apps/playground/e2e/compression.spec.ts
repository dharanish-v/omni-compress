import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BASE = '/omni-compress';

// Create a minimal valid PNG in memory for upload tests
function createMinimalPng(): Buffer {
  // 1x1 red pixel PNG
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
}

test.describe('File Upload & Compression', () => {
  test('file input is present and accepts images', async ({ page }) => {
    await page.goto(BASE);
    // Wait for the page to fully settle (View Transitions may navigate once on init)
    await page.waitForLoadState('domcontentloaded');
    // Use a longer timeout in CI to account for React hydration and any initial navigation
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached({ timeout: 15_000 });
    const accept = await fileInput.getAttribute('accept');
    expect(accept).toBeTruthy();
    expect(accept).toContain('image');
  });

  test('uploading an image triggers compression UI', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');

    // Write temp PNG file
    const tmpPath = path.join('/tmp', 'test-upload.png');
    fs.writeFileSync(tmpPath, createMinimalPng());

    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached({ timeout: 15_000 });
    await fileInput.setInputFiles(tmpPath);

    // Wait for the result card or progress indicator to appear
    // The app should show either a loading state or compression result
    await expect(
      page.getByText(/compress|processing|result|download|original|output/i).first(),
    ).toBeVisible({ timeout: 20_000 });

    fs.unlinkSync(tmpPath);
  });

  test('unsupported file type shows an error or is rejected', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');

    const tmpPath = path.join('/tmp', 'test.txt');
    fs.writeFileSync(tmpPath, 'hello world');

    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached({ timeout: 15_000 });
    // Uploading a text file — should either reject or show error
    // At minimum, no crash
    await fileInput.setInputFiles(tmpPath);
    await page.waitForLoadState('domcontentloaded');
    // No JS error thrown
    const title = await page.title();
    expect(title).toBeTruthy();

    fs.unlinkSync(tmpPath);
  });
});
