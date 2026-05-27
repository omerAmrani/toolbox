import { chromium } from 'playwright';
import { OPENU_USERNAME, OPENU_PASSWORD, OPENU_ID } from './config';
import { getClass, getLectures } from '../src/storage';

async function loginToOpal(browser: any, onProgress: (msg: string) => void): Promise<any> {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  onProgress('מתחבר לאוניברסיטה הפתוחה...');
  await page.goto(
    'https://sso.apps.openu.ac.il/login?T_PLACE=https%3A%2F%2Fopal.openu.ac.il%2Fauth%2Fouilsso%2Fredirect2.php%3Furltogo%3Dhttps%3A%2F%2Fopal.openu.ac.il%2F',
    { waitUntil: 'domcontentloaded' }
  );

  await page.fill('#p_user', OPENU_USERNAME);
  await page.fill('#p_mis_student', OPENU_ID);
  await page.fill('input[type="password"]', OPENU_PASSWORD);
  await page.click('input[type="submit"], button[type="submit"]');
  await page.waitForURL(/opal\.openu\.ac\.il/, { timeout: 30000 });
  await page.waitForLoadState('domcontentloaded');

  if (!page.url().includes('opal.openu.ac.il')) {
    throw new Error('התחברות נכשלה — בדוק פרטי גישה ב-.env');
  }

  return page;
}

export async function detectNewLectures(classId: string, onProgress = (_: string) => {}): Promise<any[]> {
  const cls = getClass(classId);
  if (!cls) throw new Error(`Class not found: ${classId}`);
  if (!cls.opalCourseUrl) throw new Error(`אין קישור OPAL לקורס "${cls.name}"`);

  const existing = getLectures(classId);
  const knownIds = new Set(
    existing
      .map((l: any) => { try { return new URL(l.url).searchParams.get('v'); } catch { return null; } })
      .filter(Boolean)
  );

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await loginToOpal(browser, onProgress);

    onProgress(`מנתח הרצאות עבור "${cls.name}"...`);
    await page.goto(cls.opalCourseUrl, { waitUntil: 'networkidle', timeout: 40000 });

    const found = await page.evaluate(() => {
      const doc = (globalThis as any).document;
      return [...doc.querySelectorAll('div.ovc_playlist[id^="playlist"]')].map((div: any) => {
        const rawId = div.id.replace('playlist', '');
        const titleEl = div.querySelector('.ovc_playlist_title');
        const dateEl = div.querySelector('.pl_recorddate');
        return {
          vId: rawId,
          name: titleEl?.getAttribute('title')?.trim() || titleEl?.textContent?.trim() || `הרצאה ${rawId}`,
          recordDate: dateEl?.textContent?.trim() || null,
        };
      });
    });

    const newLectures = found
      .filter((l: any) => l.vId && !knownIds.has(l.vId))
      .map((l: any) => {
        let lectureDate: string | null = null;
        if (l.recordDate) {
          const [day, month, year] = l.recordDate.split('/');
          if (day && month && year) lectureDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        return {
          name: l.name,
          url: `https://opal.openu.ac.il/mod/ouilvideocollection/view.php?v=${l.vId}`,
          opalId: l.vId,
          lectureDate,
        };
      });

    onProgress(`נמצאו ${newLectures.length} הרצאות חדשות עבור "${cls.name}"`);
    return newLectures;
  } finally {
    await browser.close().catch(() => {});
  }
}
