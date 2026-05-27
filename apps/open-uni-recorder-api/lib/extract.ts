import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { OPENU_USERNAME, OPENU_PASSWORD, OPENU_ID, TMP_DIR } from './config';

export async function extractVideoUrl(pageUrl: string, onProgress = (_: string) => {}, signal: AbortSignal | null = null): Promise<string> {
  if (signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' });

  const log = (msg: string) => { console.log(msg); onProgress(msg); };

  const playlistId = new URL(pageUrl).searchParams.get('v');
  if (!playlistId) throw new Error('Missing v= param in URL');

  log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const onAbort = () => browser.close().catch(() => {});
  signal?.addEventListener('abort', onAbort);

  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  try {
    log('Loading SSO login page...');
    await page.goto(
      'https://sso.apps.openu.ac.il/login?T_PLACE=https%3A%2F%2Fopal.openu.ac.il%2Fauth%2Fouilsso%2Fredirect2.php%3Furltogo%3Dhttps%3A%2F%2Fopal.openu.ac.il%2F',
      { waitUntil: 'domcontentloaded' }
    );
    log(`Login page loaded: ${page.url()}`);

    log('Filling credentials...');
    await page.fill('#p_user', OPENU_USERNAME!);
    await page.fill('#p_mis_student', OPENU_ID!);
    await page.fill('input[type="password"]', OPENU_PASSWORD!);

    log('Submitting login form...');
    await page.click('input[type="submit"], button[type="submit"]');

    log('Waiting for redirect to OPAL (up to 30s)...');
    await page.waitForURL(/opal\.openu\.ac\.il/, { timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');

    const landed = page.url();
    log(`Landed on: ${landed}`);

    if (!landed.includes('opal.openu.ac.il')) {
      throw new Error(`Login failed — still on: ${landed}. Check credentials in .env`);
    }

    let streamUrl: string | null = null;
    page.on('request', (req: any) => {
      const url = req.url();
      if (url.includes('.m3u8') && !streamUrl) {
        log(`Intercepted HLS manifest: ${url.substring(0, 120)}...`);
        streamUrl = url;
      }
    });

    log(`Navigating to video page: ${pageUrl}`);
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    log(`Video page URL: ${page.url()}`);

    if (process.env.DEBUG) {
      writeFileSync('/tmp/openu-debug.html', await page.content(), 'utf-8');
      log('HTML saved to /tmp/openu-debug.html');
    }

    log(`Clicking playlist item #playlist${playlistId}...`);
    await page.click(`#playlist${playlistId}`, { timeout: 10000 });

    log('Waiting for HLS manifest request (up to 20s)...');
    const deadline = Date.now() + 20000;
    while (!streamUrl && Date.now() < deadline) {
      await page.waitForTimeout(500);
    }

    if (!streamUrl) {
      log('Interceptor missed — trying video element src...');
      streamUrl = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        for (const frame of doc.querySelectorAll('iframe')) {
          try {
            const v = (frame as any).contentDocument?.querySelector('video');
            if (v?.currentSrc) return v.currentSrc;
          } catch (_) {}
        }
        const v = doc.querySelector('video') as any;
        return v?.currentSrc || v?.src || null;
      });
      if (streamUrl) log(`Got URL from video element: ${(streamUrl as string).substring(0, 120)}...`);
    }

    if (!streamUrl) {
      throw new Error('Could not find HLS stream URL — try DEBUG=true');
    }

    log(`Stream URL: ${streamUrl.substring(0, 100)}...`);
    return streamUrl;
  } catch (err: any) {
    if (signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
    const screenshotPath = path.join(TMP_DIR, 'debug-screenshot.png');
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.error(`\n📸 Screenshot saved: ${screenshotPath}`);
      spawn('open', [screenshotPath], { detached: true, stdio: 'ignore' }).unref();
    } catch (_) {}
    throw err;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    await browser.close().catch(() => {});
  }
}
