import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';
const CLASS_ID = 'e2e-class';
const LECTURE_ID = 'e2e-lecture';

const STATUS_URL = `${API}/api/classes/${CLASS_ID}/lectures/${LECTURE_ID}/status`;
const SUMMARIES_URL = `${API}/api/classes/${CLASS_ID}/lectures/${LECTURE_ID}/summaries`;
const TRANSCRIPT_URL = `${API}/api/classes/${CLASS_ID}/lectures/${LECTURE_ID}/transcript`;

test.describe('Lecture detail page', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(STATUS_URL, (route) =>
      route.fulfill({
        json: { id: LECTURE_ID, name: 'E2E Test Lecture', status: 'pending' },
      }),
    );
    await page.route(SUMMARIES_URL, (route) =>
      route.fulfill({ json: { versions: [], currentSummary: null } }),
    );
    await page.route(TRANSCRIPT_URL, (route) => route.fulfill({ status: 404 }));
  });

  test('shows lecture name and no-summary state for a pending lecture', async ({ page }) => {
    await page.goto(`/classes/${CLASS_ID}/lectures/${LECTURE_ID}`);
    await expect(page.locator('h1')).toContainText('E2E Test Lecture');
    await expect(page.getByText('אין סיכום עדיין')).toBeVisible();
    await expect(page.getByTestId('summarize-btn')).toBeVisible();
  });

  test('clicking summarize triggers SSE flow and renders the summary', async ({ page }) => {
    await page.route(`**/${LECTURE_ID}/transcribe`, (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: 'data: {"type":"done","status":"transcribed"}\n\n',
      }),
    );
    await page.route(`**/${LECTURE_ID}/summarize`, (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: 'data: {"type":"token","token":"Test "}\n\ndata: {"type":"token","token":"summary"}\n\ndata: {"type":"done","summary":"Test summary","status":"summarized"}\n\n',
      }),
    );

    await page.goto(`/classes/${CLASS_ID}/lectures/${LECTURE_ID}`);
    await page.getByTestId('summarize-btn').click();

    await expect(page.getByTestId('summary-body')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('הסיכום הושלם!')).toBeVisible();
  });
});
