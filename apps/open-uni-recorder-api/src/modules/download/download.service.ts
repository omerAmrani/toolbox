import { Injectable } from '@nestjs/common';
import { existsSync, rmSync, statSync, writeFileSync } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { chromium } from 'playwright';
import { WhisperService } from '../whisper/whisper.service';
import { TMP_DIR, OPENU_USERNAME, OPENU_PASSWORD, OPENU_ID, WHISPER_CONCURRENCY } from '../../config';

const CONCURRENCY = parseInt(WHISPER_CONCURRENCY, 10);
const CHUNK_SECS = 600;
const TIMESTAMP_INTERVAL_SECS = 60;

@Injectable()
export class DownloadService {
  constructor(private readonly whisper: WhisperService) {}

  // ── Extract (Playwright login + HLS URL) ─────────────────────────────────────

  async extractVideoUrl(pageUrl: string, onProgress = (_: string) => {}, signal: AbortSignal | null = null): Promise<string> {
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

      if (!streamUrl) throw new Error('Could not find HLS stream URL — try DEBUG=true');

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

  // ── Download + Transcribe (ffmpeg + whisper) ──────────────────────────────────

  private segPath(i: number): string {
    return path.join(TMP_DIR, `chunk_${String(i).padStart(3, '0')}.wav`);
  }

  private secsToHMS(s: number): string {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  private secsToHM(s: number): string {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private buildChunkText(segments: { startSec: number; text: string }[], chunkIdx: number): string {
    if (!segments.length) return '';
    const lines: string[] = [];
    let lastStampSec = -TIMESTAMP_INTERVAL_SECS;
    let pending: string[] = [];

    for (const seg of segments) {
      const absSec = chunkIdx * CHUNK_SECS + seg.startSec;
      if (absSec - lastStampSec >= TIMESTAMP_INTERVAL_SECS) {
        if (pending.length) lines.push(pending.join(' '));
        pending = [`[${this.secsToHM(absSec)}] ${seg.text}`];
        lastStampSec = absSec;
      } else {
        pending.push(seg.text);
      }
    }
    if (pending.length) lines.push(pending.join(' '));
    return lines.join('\n');
  }

  private async transcribeSegment(filePath: string, idx: number, total: number, onProgress: (msg: string) => void): Promise<{ text: string; segments: any[] }> {
    console.log(`  [transcribe] ${path.basename(filePath)} (${statSync(filePath).size} bytes)`);
    const result = await this.whisper.transcribe(filePath, () => onProgress(`מתמלל קטע ${idx + 1} מתוך ${total}...`));
    rmSync(filePath);
    return result;
  }

  private runTranscribeQueue(onProgress: (msg: string) => void) {
    const results: { idx: number; text: string; chunkText: string }[] = [];
    const pending: { idx: number; p: string; resolve: (v: { chunkText: string }) => void }[] = [];
    let active = 0;
    let totalSeen = 0;
    let firstError: Error | null = null;

    const drain = () => {
      while (active < CONCURRENCY && pending.length && !firstError) {
        active++;
        const { idx, p, resolve } = pending.shift()!;
        console.log(`\n🎙️  Transcribing segment ${idx + 1} (active=${active}, pending=${pending.length})...`);
        this.transcribeSegment(p, idx, totalSeen, onProgress).then((result) => {
          const chunkText = this.buildChunkText(result.segments, idx);
          results.push({ idx, text: result.text, chunkText });
          active--;
          drain();
          resolve({ chunkText: chunkText || result.text });
        }).catch((err: any) => {
          console.error(`  [transcribe error] segment ${idx + 1}: ${err.message}`);
          if (!firstError) firstError = err;
          active--;
          drain();
          resolve({ chunkText: '' });
        });
      }
    };

    return {
      get active() { return active; },
      get pending() { return pending.length; },
      enqueue: (idx: number): Promise<{ chunkText: string }> => {
        totalSeen = Math.max(totalSeen, idx + 1);
        return new Promise((resolve) => {
          pending.push({ idx, p: this.segPath(idx), resolve });
          drain();
        });
      },
      waitAll: async (): Promise<string> => {
        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (active === 0 && pending.length === 0) { clearInterval(check); resolve(); }
          }, 500);
        });
        if (firstError) throw firstError;
        results.sort((a, b) => a.idx - b.idx);
        return results.map(r => r.chunkText || r.text).join('\n');
      },
      get results() { return results; },
    };
  }

  async downloadAndTranscribe(
    videoUrl: string,
    onProgress = (_: string) => {},
    onChunkReady: ((idx: number, chunkText: string) => void) | null = null,
    saveMp3Path: string | null = null,
    maxDurationSecs: number | null = null,
    signal: AbortSignal | null = null,
  ): Promise<string> {
    if (signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
    for (let i = 0; existsSync(this.segPath(i)); i++) rmSync(this.segPath(i));

    const args = ['-y'];
    if (maxDurationSecs) args.push('-t', String(maxDurationSecs));
    args.push('-i', videoUrl);

    if (saveMp3Path) {
      args.push('-vn', '-acodec', 'libmp3lame', '-q:a', '4', saveMp3Path);
    }

    args.push(
      '-vn', '-ac', '1', '-ar', '16000', '-acodec', 'pcm_s16le',
      '-f', 'segment', '-segment_time', String(CHUNK_SECS),
      '-reset_timestamps', '1',
      path.join(TMP_DIR, 'chunk_%03d.wav'),
    );

    const proc = spawn('ffmpeg', args);
    let abortedBySignal = false;
    if (signal) {
      signal.addEventListener('abort', () => {
        abortedBySignal = true;
        proc.kill('SIGKILL');
      }, { once: true });
    }

    const STALL_TIMEOUT_MS = 3 * 60 * 1000;
    let totalSecs = 0;
    let nextToDetect = 0;
    let stalledByWatchdog = false;
    const queue = this.runTranscribeQueue(onProgress);
    const chunkJobs: Promise<any>[] = [];
    let stallTimer = setTimeout(() => {
      console.error('\n[ffmpeg] no progress for 3 minutes — killing, saving partial transcript');
      stalledByWatchdog = true;
      proc.kill('SIGKILL');
    }, STALL_TIMEOUT_MS);

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      const durMatch = text.match(/Duration:\s*(\d+):(\d+):(\d+)/);
      if (durMatch && !totalSecs)
        totalSecs = +durMatch[1] * 3600 + +durMatch[2] * 60 + +durMatch[3];
      const timeMatch = text.match(/time=\s*(\d+):(\d+):(\d+)/);
      if (timeMatch) {
        clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          console.error('\n[ffmpeg] no progress for 3 minutes — killing, saving partial transcript');
          stalledByWatchdog = true;
          proc.kill('SIGKILL');
        }, STALL_TIMEOUT_MS);
        const cur = +timeMatch[1] * 3600 + +timeMatch[2] * 60 + +timeMatch[3];
        const pct = totalSecs ? Math.min(Math.round((cur / totalSecs) * 100), 99) : '?';
        const msg = `מוריד: ${pct}% (${this.secsToHMS(cur)}${totalSecs ? ' / ' + this.secsToHMS(totalSecs) : ''})`;
        onProgress(msg);
        process.stdout.write(`\r${msg}  `);
      }
    });

    const pollTimer = setInterval(() => {
      let found = false;
      while (existsSync(this.segPath(nextToDetect + 1))) {
        found = true;
        const idx = nextToDetect++;
        console.log(`\n  [poll] segment ${idx + 1} sealed`);
        const job = queue.enqueue(idx).then(({ chunkText }) => {
          if (onChunkReady && chunkText) onChunkReady(idx, chunkText);
        });
        chunkJobs.push(job);
      }
      if (!found && queue.active === 0 && queue.pending === 0 && nextToDetect > 0) {
        const waitMsg = `⏳ ממתין לקטע הבא... (${nextToDetect} קטעים תומללו)`;
        onProgress(waitMsg);
        process.stdout.write(`\r${waitMsg}  `);
      }
    }, 2000);

    await new Promise<void>((resolve, reject) => {
      proc.on('close', (code: number | null) => {
        clearTimeout(stallTimer);
        process.stdout.write('\n');
        if (code === 0 || stalledByWatchdog || abortedBySignal) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
      proc.on('error', (err: Error) => { clearTimeout(stallTimer); reject(err); });
    });

    clearInterval(pollTimer);

    if (abortedBySignal) {
      for (let i = 0; existsSync(this.segPath(i)); i++) rmSync(this.segPath(i));
      throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
    }
    console.log(`[downloadAndTranscribe] ffmpeg done. nextToDetect=${nextToDetect}`);

    while (existsSync(this.segPath(nextToDetect))) {
      const idx = nextToDetect++;
      console.log(`  [drain] segment ${idx + 1} sealed`);
      const job = queue.enqueue(idx).then(({ chunkText }) => {
        if (onChunkReady && chunkText) onChunkReady(idx, chunkText);
      });
      chunkJobs.push(job);
    }

    if (nextToDetect === 0) throw new Error('No audio segments produced by ffmpeg');

    const transcript = await queue.waitAll();
    if (stalledByWatchdog) {
      const warn = `\n⚠️ [תמלול חלקי — ffmpeg תקוע לאחר ${nextToDetect} קטעים]\n`;
      onProgress(`⚠️ תמלול חלקי — נשמרו ${nextToDetect} קטעים`);
      console.warn(warn);
      return transcript + warn;
    }
    console.log(`✅  Transcribed ${transcript.split(' ').length} words from ${nextToDetect} segment(s)`);
    return transcript;
  }
}
