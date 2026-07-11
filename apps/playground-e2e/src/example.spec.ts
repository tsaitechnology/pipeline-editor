import { test, expect } from '@playwright/test';

test('the board editor loads', async ({ page }) => {
  await page.goto('/board');

  // The editor host and its always-available toolbar render.
  await expect(page.locator('pe-board')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export' })).toBeVisible();
});
