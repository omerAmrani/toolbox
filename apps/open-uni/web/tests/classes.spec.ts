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
    await page.route('**/api/classes/*/detect', (route) => route.fulfill({ json: { newLectures: [] } }));
    await page.goto('/classes');
    await page.route(`${API}/api/classes/opal-metadata`, (route) =>
      route.fulfill({ status: 502, json: { error: 'opal unreachable' } }),
    );

    await page.getByTestId('create-class-btn').click();
    const urlInput = page.getByPlaceholder('https://opal.openu.ac.il/mod/ouilvideocollection/view.php?id=...');
    await urlInput.fill('https://opal.openu.ac.il/course/e2e-fake');
    await urlInput.blur();
    await page.getByTestId('class-name-input').waitFor({ state: 'visible' });
    await page.getByTestId('class-name-input').fill('E2E Test Class');
    await page.getByTestId('class-submit-btn').click();

    await page.waitForURL(/\/classes\/.+/);
    await expect(page.locator('h1')).toContainText('E2E Test Class');

    const classId = page.url().split('/classes/')[1];
    createdClassId = classId ?? null;
  });

  test('detects lectures right after creating a course and reports the count', async ({ page }) => {
    let releaseDetect = () => {};
    const detectHeld = new Promise<void>((r) => (releaseDetect = r));
    await page.route('**/api/classes/*/detect', async (route) => {
      await detectHeld;
      await route.fulfill({ json: { newLectures: [{ id: 'a' }, { id: 'b' }] } });
    });
    await page.route(`${API}/api/classes/opal-metadata`, (route) =>
      route.fulfill({ status: 502, json: { error: 'opal unreachable' } }),
    );
    await page.goto('/classes');

    await page.getByTestId('create-class-btn').click();
    const urlInput = page.getByPlaceholder('https://opal.openu.ac.il/mod/ouilvideocollection/view.php?id=...');
    await urlInput.fill('https://opal.openu.ac.il/course/e2e-fake');
    await urlInput.blur();
    await page.getByTestId('class-name-input').fill('E2E Detect Class');
    await page.getByTestId('class-submit-btn').click();

    await expect(page.getByTestId('detecting-msg')).toBeVisible();
    await expect(page).toHaveURL(/\/classes\/[^?]+$/);
    createdClassId = page.url().split('/classes/')[1] ?? null;

    releaseDetect();
    await expect(page.getByText('נמצאו 2 הרצאות')).toBeVisible();
    await expect(page.getByTestId('detecting-msg')).toBeHidden();
  });

  test('tells the user when Detect is refused because a job is running', async ({ page, request }) => {
    const r = await request.post(`${API}/api/classes`, {
      data: { name: 'E2E Detect Busy', opalCourseUrl: 'https://opal.openu.ac.il/course/e2e-fake' },
    });
    createdClassId = (await r.json()).id;
    await page.route('**/api/classes/*/detect', (route) =>
      route.fulfill({ status: 429, json: { error: 'busy' } }),
    );

    await page.goto(`/classes/${createdClassId}?detect=1`);
    await expect(page.getByText('יש עבודה פעילה — הרצאות לא נסרקו', { exact: false })).toBeVisible();
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

  test('edits an existing class via the edit button', async ({ page, request }) => {
    const r = await request.post(`${API}/api/classes`, {
      data: { name: 'E2E Edit Me', code: '111', semester: 'א', year: 2024 },
    });
    const { id } = await r.json();
    createdClassId = id;

    await page.goto(`/classes/${id}`);
    await page.getByTitle('ערוך קורס').click();

    const nameInput = page.getByTestId('class-name-input');
    await nameInput.fill('E2E Edited Name');
    await page.getByTestId('class-submit-btn').click();

    await expect(page.locator('h1')).toContainText('E2E Edited Name');
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
