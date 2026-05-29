import { test, expect } from '@playwright/test';

test.describe('/setup page', () => {
  test('renders without crash and shows university selection', async ({ page }) => {
    await page.goto('/setup');
    await expect(page.getByRole('button').filter({ hasText: 'האוניברסיטה הפתוחה' })).toBeVisible();
  });

  test('selecting a university enables the continue button', async ({ page }) => {
    await page.goto('/setup');

    const continueBtn = page.getByRole('button', { name: /המשך/ });
    await expect(continueBtn).toBeDisabled();

    await page.getByRole('button').filter({ hasText: 'האוניברסיטה הפתוחה' }).click();
    await expect(continueBtn).toBeEnabled();
  });

  test('step 1 → step 2 shows credentials form', async ({ page }) => {
    await page.goto('/setup');
    await page.getByRole('button').filter({ hasText: 'האוניברסיטה הפתוחה' }).click();
    await page.getByRole('button', { name: /המשך/ }).click();

    // step 2: credential inputs are visible
    await expect(page.locator('input').first()).toBeVisible();
  });

  test('completes all 3 steps and redirects to /classes', async ({ page }) => {
    await page.goto('/setup');

    // step 1 — select university
    await page.getByRole('button').filter({ hasText: 'האוניברסיטה הפתוחה' }).click();
    await page.getByRole('button', { name: /המשך/ }).click();

    // step 2 — fill credentials (mocked — no real connection attempt)
    await page.locator('input').nth(0).fill('testuser');
    await page.locator('input').nth(1).fill('testpass');

    // click "התחבר" to simulate connection test
    const connectBtn = page.getByRole('button', { name: 'התחבר' });
    await connectBtn.click();

    // after mock connection success, continue button appears
    const continueStep2 = page.getByRole('button', { name: /המשך/ });
    await expect(continueStep2).toBeVisible({ timeout: 5_000 });
    await continueStep2.click();

    // step 3 — done, navigate to classes
    await page.getByRole('button', { name: /קח אותי לקורסים/ }).click();
    await expect(page).toHaveURL('/classes');
  });
});
