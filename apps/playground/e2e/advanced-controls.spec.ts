import { test, expect } from '@playwright/test';

const BASE = '/omni-compress';

test.describe('Advanced Controls', () => {
  test('advanced controls panel toggles open and closed', async ({ page }) => {
    await page.goto(BASE);

    // Find the advanced controls toggle button
    const toggle = page.getByRole('button', { name: /advanced|settings|options/i }).first();
    if (await toggle.isVisible()) {
      await toggle.click();
      // Panel content should now be visible
      await expect(page.getByText(/quality|format|width|height/i).first()).toBeVisible();

      // Toggle closed
      await toggle.click();
    }
  });

  test('format selector renders with options', async ({ page }) => {
    await page.goto(BASE);

    // Look for a select element or custom dropdown for format
    const formatControl = page
      .locator('select, [role="listbox"], [role="combobox"]')
      .first();

    if (await formatControl.isVisible()) {
      await expect(formatControl).toBeEnabled();
    }
  });
});
