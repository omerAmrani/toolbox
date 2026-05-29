import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001';
const CLASS_ID = 'e2e-qa-class';
const LECTURE_ID = 'e2e-qa-lecture';
const BASE = `${API}/api/classes/${CLASS_ID}/lectures/${LECTURE_ID}`;

const QUESTIONS = ['מה הסיבה העיקרית לתופעה?', 'כיצד ניתן להתמודד עם הבעיה?'];
const FEEDBACK = [
  { correct: true, explanation: 'מצוין! תשובה נכונה.' },
  { correct: false, explanation: 'לא מדויק. נסה שוב.' },
];

test.describe('Q&A flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`${BASE}/status`, (route) =>
      route.fulfill({
        json: {
          id: LECTURE_ID,
          name: 'E2E QA Lecture',
          status: 'summarized',
          currentSummary: 'summary-v1',
        },
      }),
    );
    await page.route(`${BASE}/summaries`, (route) =>
      route.fulfill({
        json: { versions: [{ id: 'summary-v1' }], currentSummary: 'summary-v1' },
      }),
    );
    await page.route(`${BASE}/summary`, (route) =>
      route.fulfill({ body: 'סיכום לבדיקה' }),
    );
    await page.route(`${BASE}/transcript`, (route) => route.fulfill({ status: 404 }));
  });

  test('generates questions, fills answers, and shows feedback', async ({ page }) => {
    let qaGetCount = 0;

    await page.route(`${BASE}/qa/generate`, (route) =>
      route.fulfill({ json: { questions: QUESTIONS, roundIndex: 0 } }),
    );
    await page.route(`${BASE}/qa/answer`, (route) =>
      route.fulfill({ json: { feedback: FEEDBACK } }),
    );
    await page.route(`${BASE}/qa`, (route) => {
      qaGetCount++;
      if (qaGetCount === 1) return route.fulfill({ json: { rounds: [] } });
      if (qaGetCount === 2)
        return route.fulfill({
          json: { rounds: [{ questions: QUESTIONS, answers: [], feedback: [] }] },
        });
      return route.fulfill({
        json: {
          rounds: [{ questions: QUESTIONS, answers: ['תשובה 1', 'תשובה 2'], feedback: FEEDBACK }],
        },
      });
    });

    await page.goto(`/classes/${CLASS_ID}/lectures/${LECTURE_ID}`);

    // open Q&A panel
    await page.getByRole('button', { name: 'פתח' }).click();

    // generate questions (first round — button says "צור שאלות")
    await page.getByRole('button', { name: /צור שאלות/ }).click();

    // fill both answer textareas
    const textareas = page.locator('textarea');
    await textareas.nth(0).fill('תשובה 1');
    await textareas.nth(1).fill('תשובה 2');

    // submit answers
    await page.getByRole('button', { name: 'שלח תשובות' }).click();

    // feedback renders
    await expect(page.getByText('מצוין! תשובה נכונה.')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('לא מדויק. נסה שוב.')).toBeVisible();
  });

  test('Q&A section is hidden until opened', async ({ page }) => {
    await page.route(`${BASE}/qa`, (route) =>
      route.fulfill({ json: { rounds: [] } }),
    );

    await page.goto(`/classes/${CLASS_ID}/lectures/${LECTURE_ID}`);

    // Q&A heading is in the DOM but the content is collapsed
    await expect(page.getByRole('button', { name: 'פתח' })).toBeVisible();
    await expect(page.getByRole('button', { name: /צור שאלות/ })).not.toBeVisible();
  });
});
