import { existsSync, rmSync, statSync } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { transcribe } from './transcribe.js';
import { TMP_DIR } from './config.js';

const CONCURRENCY = parseInt(process.env.WHISPER_CONCURRENCY || '2', 10);
const CHUNK_SECS = 600;

function secsToHMS(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function secsToHM(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function segPath(i) {
  return path.join(TMP_DIR, `chunk_${String(i).padStart(3, '0')}.wav`);
}

const TIMESTAMP_INTERVAL_SECS = 60;

function buildChunkText(segments, chunkIdx) {
  if (!segments.length) return '';
  const lines = [];
  let lastStampSec = -TIMESTAMP_INTERVAL_SECS;
  let pending = [];

  for (const seg of segments) {
    const absSec = chunkIdx * CHUNK_SECS + seg.startSec;
    if (absSec - lastStampSec >= TIMESTAMP_INTERVAL_SECS) {
      if (pending.length) lines.push(pending.join(' '));
      pending = [`[${secsToHM(absSec)}] ${seg.text}`];
      lastStampSec = absSec;
    } else {
      pending.push(seg.text);
    }
  }
  if (pending.length) lines.push(pending.join(' '));
  return lines.join('\n');
}

async function transcribeSegment(filePath, idx, total, onProgress) {
  console.log(`  [transcribe] ${path.basename(filePath)} (${statSync(filePath).size} bytes)`);
  const result = await transcribe(filePath, () => onProgress(`מתמלל קטע ${idx + 1} מתוך ${total}...`));
  rmSync(filePath);
  return result;
}

function runTranscribeQueue(onProgress) {
  const results = [];
  const pending = [];
  let active = 0;
  let totalSeen = 0;

  function drain() {
    while (active < CONCURRENCY && pending.length) {
      active++;
      const { idx, p, resolve } = pending.shift();
      console.log(`\n🎙️  Transcribing segment ${idx + 1} (active=${active}, pending=${pending.length})...`);
      transcribeSegment(p, idx, totalSeen, onProgress).then((result) => {
        const chunkText = buildChunkText(result.segments, idx);
        results.push({ idx, text: result.text, chunkText });
        active--;
        drain();
        resolve({ chunkText: chunkText || result.text });
      }).catch((err) => {
        console.error(`  [transcribe error] segment ${idx + 1}: ${err.message}`);
        active--;
        drain();
        resolve({ chunkText: '' });
      });
    }
  }

  return {
    get active() { return active; },
    get pending() { return pending.length; },
    enqueue(idx) {
      totalSeen = Math.max(totalSeen, idx + 1);
      return new Promise((resolve) => {
        pending.push({ idx, p: segPath(idx), resolve });
        drain();
      });
    },
    async waitAll() {
      await new Promise((resolve) => {
        const check = setInterval(() => {
          if (active === 0 && pending.length === 0) { clearInterval(check); resolve(); }
        }, 500);
      });
      results.sort((a, b) => a.idx - b.idx);
      return results.map(r => r.chunkText || r.text).join('\n');
    },
    get results() { return results; },
  };
}

// Downloads stream and transcribes concurrently.
// If saveMp3Path is provided, also saves the full audio as mp3 (single ffmpeg pass).
export async function downloadAndTranscribe(videoUrl, onProgress = () => {}, onChunkReady = null, saveMp3Path = null, maxDurationSecs = null, signal = null) {
  if (signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
  for (let i = 0; existsSync(segPath(i)); i++) rmSync(segPath(i));

  const args = ['-y'];
  if (maxDurationSecs) args.push('-t', String(maxDurationSecs));
  args.push('-i', videoUrl);

  if (saveMp3Path) {
    args.push('-vn', '-acodec', 'libmp3lame', '-q:a', '4', saveMp3Path);
  }

  args.push(
    '-vn', '-ac', '1', '-ar', '16000', '-acodec', 'pcm_s16le',
    '-f', 'segment', '-segment_time', CHUNK_SECS,
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
  const queue = runTranscribeQueue(onProgress);
  const chunkJobs = [];
  let stallTimer = setTimeout(() => {
    console.error('\n[ffmpeg] no progress for 3 minutes — killing, saving partial transcript');
    stalledByWatchdog = true;
    proc.kill('SIGKILL');
  }, STALL_TIMEOUT_MS);

  proc.stderr.on('data', (chunk) => {
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
      const msg = `מוריד: ${pct}% (${secsToHMS(cur)}${totalSecs ? ' / ' + secsToHMS(totalSecs) : ''})`;
      onProgress(msg);
      process.stdout.write(`\r${msg}  `);
    }
  });

  const pollTimer = setInterval(() => {
    let found = false;
    while (existsSync(segPath(nextToDetect + 1))) {
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

  await new Promise((resolve, reject) => {
    proc.on('close', (code) => {
      clearTimeout(stallTimer);
      process.stdout.write('\n');
      if (code === 0 || stalledByWatchdog || abortedBySignal) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
    proc.on('error', (err) => { clearTimeout(stallTimer); reject(err); });
  });

  clearInterval(pollTimer);

  if (abortedBySignal) {
    for (let i = 0; existsSync(segPath(i)); i++) rmSync(segPath(i));
    throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
  }
  console.log(`[downloadAndTranscribe] ffmpeg done. nextToDetect=${nextToDetect}`);

  while (existsSync(segPath(nextToDetect))) {
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
