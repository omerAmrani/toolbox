import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('Settings page', () => {
  test('renders without crash', async ({ page }) => {
    await page.goto('/settings');
    // page has multiple sections — at least one heading is visible
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('Gemini health check shows ok and latency after API responds', async ({ page }) => {
    await page.route(`${API}/api/health/gemini`, (route) =>
      route.fulfill({
        json: { ok: true, configured: true, ms: 145, response: 'ok' },
      }),
    );

    await page.goto('/settings');

    // find the Gemini model card and click its test button
    const geminiCard = page.locator('.model').filter({ hasText: 'Gemini' }).first();
    await geminiCard.getByRole('button', { name: /בדוק/ }).click();

    await expect(geminiCard.getByText('145ms')).toBeVisible({ timeout: 5_000 });
  });

  test('Claude health check shows error state when API returns not ok', async ({ page }) => {
    await page.route(`${API}/api/health/claude`, (route) =>
      route.fulfill({
        json: { ok: false, configured: true, error: 'Invalid API key' },
      }),
    );

    await page.goto('/settings');

    const claudeCard = page.locator('.model').filter({ hasText: 'Claude' }).first();
    await claudeCard.getByRole('button', { name: /בדוק/ }).click();

    await expect(claudeCard.getByText('Invalid API key')).toBeVisible({ timeout: 5_000 });
  });
});
