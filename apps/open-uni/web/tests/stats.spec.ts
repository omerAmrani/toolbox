import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('/stats page', () => {
  test('renders all stat tiles without crash (empty data)', async ({ page }) => {
    await page.route(`${API}/api/classes`, (route) => route.fulfill({ json: [] }));

    await page.goto('/stats');

    await expect(page.locator('.stat-tile__eye', { hasText: 'מסוכמות' })).toBeVisible();
    await expect(page.locator('.stat-tile__eye', { hasText: 'ממתינות' })).toBeVisible();
    await expect(page.locator('.stat-tile__eye', { hasText: 'שגיאות' })).toBeVisible();
    await expect(page.locator('.stat-tile__eye', { hasText: 'קורסים' })).toBeVisible();
  });

  test('shows per-class breakdown when classes exist', async ({ page }) => {
    await page.route(`${API}/api/classes`, (route) =>
      route.fulfill({
        json: [{ id: 'cls-1', name: 'מתמטיקה', semester: 'spring', year: 2025 }],
      }),
    );
    await page.route(`${API}/api/classes/cls-1/lectures`, (route) =>
      route.fulfill({
        json: [
          { id: 'lec-1', name: 'הרצאה 1', status: 'summarized' },
          { id: 'lec-2', name: 'הרצאה 2', status: 'pending' },
        ],
      }),
    );

    await page.goto('/stats');

    await expect(page.locator('.bycls__title', { hasText: 'מתמטיקה' })).toBeVisible();
    // summarized/total count shown in the per-class breakdown
    await expect(page.locator('.bycls__stat').first()).toContainText('1');
  });
});
