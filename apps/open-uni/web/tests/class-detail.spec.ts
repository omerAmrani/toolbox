import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';

test.describe('Class detail page', () => {
  let classId: string;

  test.beforeAll(async ({ request }) => {
    const r = await request.post(`${API}/api/classes`, { data: { name: 'E2E Class Detail' } });
    classId = (await r.json()).id;
  });

  test.afterAll(async ({ request }) => {
    await request.delete(`${API}/api/classes/${classId}`).catch(() => {});
  });

  test('shows class name in header', async ({ page }) => {
    await page.goto(`/classes/${classId}`);
    await expect(page.locator('h1')).toContainText('E2E Class Detail');
  });

  test('run pipeline button triggers transcribe + summarize SSE and shows success toast', async ({
    page,
    request,
  }) => {
    const r = await request.post(`${API}/api/classes/${classId}/lectures`, {
      data: { name: 'E2E Pipeline Lecture', url: 'https://example.com/lec.mp4' },
    });
    const created = await r.json();
    const lectureId = created.id;

    await page.route(`**/${lectureId}/transcribe`, (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: 'data: {"type":"progress","message":"Starting"}\n\ndata: {"type":"progress","message":"34%","pct":34}\n\ndata: {"type":"done","status":"transcribed"}\n\n',
      }),
    );
    let releaseSummarize = () => {};
    const summarizeHeld = new Promise<void>((r) => (releaseSummarize = r));
    await page.route(`**/${lectureId}/summarize`, async (route) => {
      await summarizeHeld;
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: 'data: {"type":"progress","message":"Summarizing"}\n\ndata: {"type":"done","status":"summarized","summary":"Test summary"}\n\n',
      });
    });

    await page.goto(`/classes/${classId}`);
    await page.getByTestId('run-pipeline-btn').click();
    // Between transcribe and summarize the card must stay busy, not look idle.
    await expect(page.getByTestId('lecture-progress')).toBeVisible();
    await expect(page.getByTestId('run-pipeline-btn')).toHaveCount(0);
    await expect(page.getByTestId('lecture-progress-msg')).toHaveText('34%');
    await expect(page.getByTestId('lecture-progress').locator('span')).toHaveAttribute('style', /width: 34%/);
    releaseSummarize();
    await expect(page.getByText('הסיכום הושלם!')).toBeVisible({ timeout: 15_000 });
  });
});
