import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('Classes page', () => {
  let createdClassId: string | null = null;

  test.afterEach(async ({ request }) => {
    if (createdClassId) {
      await request.delete(`${API}/api/classes/${createdClassId}`).catch(() => {});
      createdClassId = null;
    }
  });

  test('shows empty state when no classes exist', async ({ page }) => {
    await page.route(`${API}/api/classes`, (route) => route.fulfill({ json: [] }));
    await page.goto('/classes');
    await expect(page.getByText('אין קורסים עדיין')).toBeVisible();
  });

  test('creates a class via modal and navigates to its detail page', async ({ page }) => {
    await page.goto('/classes');
    await page.getByTestId('create-class-btn').click();
    await page.getByTestId('class-name-input').fill('E2E Test Class');
    await page.getByTestId('class-submit-btn').click();

    await page.waitForURL(/\/classes\/.+/);
    await expect(page.locator('h1')).toContainText('E2E Test Class');

    const classId = page.url().split('/classes/')[1];
    createdClassId = classId;
  });

  test('shows the class card in the list after creation', async ({ page, request }) => {
    const r = await request.post(`${API}/api/classes`, { data: { name: 'E2E List Test' } });
    const { id } = await r.json();
    createdClassId = id;

    await page.goto('/classes');
    await expect(page.getByTestId('class-card').filter({ hasText: 'E2E List Test' })).toBeVisible();
  });

  test('navigates to class detail when clicking a class card', async ({ page, request }) => {
    const r = await request.post(`${API}/api/classes`, { data: { name: 'E2E Nav Test' } });
    const { id } = await r.json();
    createdClassId = id;

    await page.goto('/classes');
    await page.getByTestId('class-card').filter({ hasText: 'E2E Nav Test' }).click();

    await page.waitForURL(`/classes/${id}`);
    await expect(page.locator('h1')).toContainText('E2E Nav Test');
  });

  test('deletes a class from the list', async ({ page, request }) => {
    const r = await request.post(`${API}/api/classes`, { data: { name: 'E2E Delete Me' } });
    const { id } = await r.json();
    createdClassId = id;

    await page.goto('/classes');
    page.on('dialog', (d) => d.accept());
    await page
      .getByTestId('class-card')
      .filter({ hasText: 'E2E Delete Me' })
      .getByTestId('class-delete-btn')
      .click();

    await expect(
      page.getByTestId('class-card').filter({ hasText: 'E2E Delete Me' }),
    ).not.toBeVisible();
    createdClassId = null;
  });
});
