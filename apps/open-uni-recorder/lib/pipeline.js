import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getClasses, getLectures, getLecture, updateLectureMeta,
  createLecture, lectureDirPath, saveSummaryVersion,
} from '../src/storage.js';
import { detectNewLectures } from './detect.js';
import { extractVideoUrl } from './extract.js';
import { downloadAndTranscribe } from './download.js';
import { getSummarizer } from './summarize.js';
import { WHISPER_MODEL, WHISPER_BACKEND, SUMMARIZE_BACKEND } from './config.js';
import { sendLectureSummary, sendDetectionNotification } from './email.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const CRON_LOG_PATH = path.join(DATA_DIR, 'cron-log.json');

let queueRunning = false;
const activeAbortControllers = new Map();

export function isQueueRunning() { return queueRunning; }

// ── Cron log ──────────────────────────────────────────────────────────────────

function readCronLog() {
  try { return JSON.parse(readFileSync(CRON_LOG_PATH, 'utf8')); } catch { return []; }
}

export function logCronRun(entry) {
  mkdirSync(DATA_DIR, { recursive: true });
  const log = readCronLog();
  log.push({ ...entry, timestamp: new Date().toISOString() });
  if (log.length > 50) log.splice(0, log.length - 50);
  writeFileSync(CRON_LOG_PATH, JSON.stringify(log, null, 2));
}

export function getLastCronLog() {
  const log = readCronLog();
  return log[log.length - 1] || null;
}

// ── Startup recovery ──────────────────────────────────────────────────────────

export function resetStuckProcessing() {
  for (const cls of getClasses()) {
    for (const lecture of getLectures(cls.id)) {
      if (lecture.status === 'processing') {
        updateLectureMeta(cls.id, lecture.id, {
          status: 'failed',
          lastError: 'Server restarted mid-job',
          lastErrorAt: new Date().toISOString(),
        });
        console.log(`[pipeline] reset stuck lecture: ${cls.id}/${lecture.id}`);
      }
    }
  }
}

// ── Queue runner ──────────────────────────────────────────────────────────────

export async function runQueue(onProgress = () => {}) {
  if (queueRunning) {
    onProgress('תור כבר פועל');
    return;
  }
  queueRunning = true;

  try {
    const pending = [];
    for (const cls of getClasses()) {
      for (const lecture of getLectures(cls.id)) {
        if (lecture.status === 'pending') pending.push({ classId: cls.id, lectureId: lecture.id });
      }
    }

    onProgress(`תור: ${pending.length} הרצאות ממתינות`);

    for (const { classId, lectureId } of pending) {
      const lecture = getLecture(classId, lectureId);
      if (!lecture || lecture.status !== 'pending') continue;

      const dir = lectureDirPath(classId, lectureId);
      const transcriptPath = path.join(dir, 'transcript.txt');
      const mp3Path = path.join(dir, 'audio.mp3');

      const controller = new AbortController();
      const abortKey = `${classId}/${lectureId}:transcribe`;
      activeAbortControllers.set(abortKey, controller);

      try {
        updateLectureMeta(classId, lectureId, { status: 'processing', startedAt: new Date().toISOString() });
        onProgress(`מתחיל: ${lecture.name}`);

        if (!existsSync(transcriptPath)) {
          const videoUrl = await extractVideoUrl(lecture.url, onProgress, controller.signal);
          const transcript = await downloadAndTranscribe(videoUrl, onProgress, null, mp3Path, null, controller.signal);
          writeFileSync(transcriptPath, transcript);
          updateLectureMeta(classId, lectureId, { whisperModel: WHISPER_MODEL, whisperBackend: WHISPER_BACKEND });
        }

        const transcript = readFileSync(transcriptPath, 'utf8');
        const { mergeSummaries } = await getSummarizer();
        const summary = await mergeSummaries([transcript], onProgress, () => {});
        saveSummaryVersion(classId, lectureId, summary, SUMMARIZE_BACKEND);

        updateLectureMeta(classId, lectureId, {
          status: 'done',
          summarizedAt: new Date().toISOString(),
          summarizeBackend: SUMMARIZE_BACKEND,
        });
        onProgress(`הושלם: ${lecture.name}`);
        console.log(`[pipeline] done: ${classId}/${lectureId}`);

        const cls = getClasses().find(c => c.id === classId);
        sendLectureSummary({
          className: cls?.name || classId,
          lectureName: lecture.name,
          lectureDate: lecture.lectureDate,
          summaryContent: summary,
        }).catch(err => console.warn('[email] failed to send:', err.message));
      } catch (err) {
        const aborted = controller.signal.aborted;
        if (aborted) console.log(`[pipeline] aborted: ${classId}/${lectureId}`);
        else console.error(`[pipeline] failed ${classId}/${lectureId}:`, err.message);
        updateLectureMeta(classId, lectureId, {
          status: aborted ? 'aborted' : 'failed',
          lastError: aborted ? null : err.message,
          lastErrorAt: aborted ? null : new Date().toISOString(),
        });
        onProgress(aborted ? `בוטל: ${lecture.name}` : `שגיאה: ${lecture.name} — ${err.message}`);
      } finally {
        activeAbortControllers.delete(abortKey);
      }
    }

    onProgress('התור הסתיים');
  } finally {
    queueRunning = false;
  }
}

// ── Full pipeline (detect + queue) — shared by cron and manual trigger ────────

export async function runFullPipeline(onProgress = () => {}) {
  if (queueRunning) {
    onProgress('פייפליין כבר פועל');
    return { found: 0, queued: 0 };
  }

  const classes = getClasses().filter(c => c.opalCourseUrl);
  const foundLectures = [];

  for (const cls of classes) {
    try {
      onProgress(`בודק הרצאות חדשות: ${cls.name}`);
      const newLectures = await detectNewLectures(cls.id, onProgress);
      for (const lec of newLectures) {
        createLecture(cls.id, lec);
        foundLectures.push({ className: cls.name, lectureName: lec.name, lectureDate: lec.lectureDate });
      }
    } catch (err) {
      console.error(`[pipeline] detect failed for ${cls.id}:`, err.message);
      onProgress(`שגיאה בזיהוי: ${cls.name} — ${err.message}`);
    }
  }

  onProgress(`נמצאו ${foundLectures.length} הרצאות חדשות`);

  if (foundLectures.length > 0) {
    sendDetectionNotification(foundLectures).catch(err =>
      console.warn('[email] detection notification failed:', err.message)
    );
  }

  return { found: foundLectures.length, queued: foundLectures.length };
}
