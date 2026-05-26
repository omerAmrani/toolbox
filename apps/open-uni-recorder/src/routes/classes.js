import { Router } from 'express';
import { existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs';
import { EventEmitter } from 'events';
import path from 'path';
import {
  createClass, getClasses, getClass, deleteClass, updateClassMeta,
  createLecture, getLectures, getLecture, updateLectureMeta, deleteLecture,
  lectureDirPath, CLASSES_DIR,
  saveSummaryVersion, getSummaryVersions, getSummaryContent,
  getCurrentSummaryContent, setCurrentSummary, deleteSummaryVersion,
} from '../storage.js';
import { detectNewLectures } from '../../lib/detect.js';
import { runQueue, isQueueRunning, runFullPipeline, getLastCronLog } from '../../lib/pipeline.js';
import { sendLectureSummary } from '../../lib/email.js';
import { generateQuestions, evaluateAnswers } from '../../lib/qa.js';
import { extractVideoUrl } from '../../lib/extract.js';
import { downloadAndTranscribe } from '../../lib/download.js';
import { getSummarizer, withAbort } from '../../lib/summarize.js';
import { WHISPER_BACKEND, WHISPER_MODEL, SUMMARIZE_BACKEND } from '../../lib/config.js';
import { activeAbortControllers } from '../jobs.js';

const router = Router();

const activeJobs = new Map(); // `${classId}/${lectureId}` → EventEmitter

function attachSSEClient(bus, res, req) {
  const send = startSSE(res);
  const onEvent = (data) => { try { send(data); } catch (_) {} };
  const onEnd = () => { bus.off('event', onEvent); bus.off('end', onEnd); try { res.end(); } catch (_) {} };
  bus.on('event', onEvent);
  bus.on('end', onEnd);
  req.on('close', () => { bus.off('event', onEvent); bus.off('end', onEnd); });
}

function startSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  return (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ── Classes ───────────────────────────────────────────────────────────────────
router.get('/', (_req, res) => {
  const classes = getClasses();
  res.json(classes.map(c => ({
    ...c,
    lectureCount: getLectures(c.id).length,
  })));
});

router.post('/', (req, res) => {
  const { name, semester, year } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  res.status(201).json(createClass({ name, semester, year }));
});

router.patch('/:classId', (req, res) => {
  const { classId } = req.params;
  if (!getClass(classId)) return res.status(404).json({ error: 'Not found' });
  const { opalCourseUrl } = req.body;
  const updates = {};
  if (opalCourseUrl !== undefined) updates.opalCourseUrl = opalCourseUrl;
  res.json(updateClassMeta(classId, updates));
});

router.delete('/:classId', (req, res) => {
  if (!deleteClass(req.params.classId)) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

router.get('/queue', (_req, res) => {
  const classes = getClasses();
  const rows = [];
  for (const cls of classes) {
    for (const lecture of getLectures(cls.id)) {
      rows.push({
        classId: cls.id,
        className: cls.name,
        lectureId: lecture.id,
        name: lecture.name,
        status: lecture.status,
        addedAt: lecture.addedAt,
        startedAt: lecture.startedAt || null,
        summarizedAt: lecture.summarizedAt || null,
        lastError: lecture.lastError || null,
        lastErrorAt: lecture.lastErrorAt || null,
      });
    }
  }
  res.json({ running: isQueueRunning(), lectures: rows });
});

router.post('/run-queue', (_req, res) => {
  if (isQueueRunning()) return res.json({ ok: true, message: 'already running' });
  runQueue((msg) => console.log('[queue]', msg));
  res.json({ ok: true });
});

router.post('/test-email', async (req, res) => {
  const { classId, lectureId } = req.body;
  if (!classId || !lectureId) return res.status(400).json({ error: 'classId and lectureId required' });
  const cls = getClass(classId);
  const lecture = getLecture(classId, lectureId);
  if (!cls || !lecture) return res.status(404).json({ error: 'Not found' });
  const summaryContent = getCurrentSummaryContent(classId, lectureId);
  if (!summaryContent) return res.status(400).json({ error: 'No summary found for this lecture' });
  try {
    await sendLectureSummary({
      className: cls.name,
      lectureName: lecture.name,
      lectureDate: lecture.lectureDate,
      summaryContent,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/run-pipeline', (_req, res) => {
  if (isQueueRunning()) return res.json({ ok: true, message: 'already running' });
  runFullPipeline((msg) => console.log('[pipeline]', msg));
  res.json({ ok: true });
});

router.get('/cron-log', (_req, res) => {
  res.json(getLastCronLog());
});

router.post('/sync', async (req, res) => {
  const send = startSSE(res);
  const classes = getClasses().filter(c => c.opalCourseUrl);

  if (!classes.length) {
    send({ type: 'done', results: [], message: 'אין קורסים עם קישור OPAL מוגדר' });
    return res.end();
  }

  const results = [];
  for (const cls of classes) {
    try {
      send({ type: 'progress', message: `בודק: ${cls.name}...` });
      const newLectures = await detectNewLectures(cls.id, (msg) =>
        send({ type: 'progress', message: msg })
      );
      results.push({ classId: cls.id, className: cls.name, newLectures });
      send({ type: 'class', classId: cls.id, className: cls.name, newLectures });
    } catch (err) {
      results.push({ classId: cls.id, className: cls.name, error: err.message });
      send({ type: 'class', classId: cls.id, className: cls.name, error: err.message, newLectures: [] });
    }
  }

  send({ type: 'done', results });
  res.end();
});

// ── Lectures ──────────────────────────────────────────────────────────────────
router.get('/:classId/lectures', (req, res) => {
  if (!getClass(req.params.classId)) return res.status(404).json({ error: 'Class not found' });
  res.json(getLectures(req.params.classId));
});

router.post('/:classId/lectures', (req, res) => {
  if (!getClass(req.params.classId)) return res.status(404).json({ error: 'Class not found' });
  const { name, url, lectureDate, status } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name and url required' });
  const allowed = ['pending', 'skipped'];
  const initialStatus = allowed.includes(status) ? status : 'pending';
  res.status(201).json(createLecture(req.params.classId, { name, url, lectureDate, status: initialStatus }));
});

router.delete('/:classId/lectures/:lectureId', (req, res) => {
  const { classId, lectureId } = req.params;
  if (!deleteLecture(classId, lectureId)) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

router.patch('/:classId/lectures/:lectureId', (req, res) => {
  const { classId, lectureId } = req.params;
  if (!getLecture(classId, lectureId)) return res.status(404).json({ error: 'Not found' });
  const { name, lectureDate } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (lectureDate !== undefined) updates.lectureDate = lectureDate;
  res.json(updateLectureMeta(classId, lectureId, updates));
});

// ── Retry ─────────────────────────────────────────────────────────────────────
router.post('/:classId/lectures/:lectureId/retry', (req, res) => {
  const { classId, lectureId } = req.params;
  const lecture = getLecture(classId, lectureId);
  if (!lecture) return res.status(404).json({ error: 'Not found' });
  if (lecture.status !== 'failed') return res.status(400).json({ error: 'Only failed lectures can be retried' });
  res.json(updateLectureMeta(classId, lectureId, {
    status: 'pending',
    lastError: null,
    lastErrorAt: null,
    startedAt: null,
  }));
});

// ── Q&A ───────────────────────────────────────────────────────────────────────
router.get('/:classId/lectures/:lectureId/qa', (req, res) => {
  const { classId, lectureId } = req.params;
  if (!getLecture(classId, lectureId)) return res.status(404).json({ error: 'Not found' });
  const p = path.join(lectureDirPath(classId, lectureId), 'qa.json');
  if (!existsSync(p)) return res.json({ rounds: [] });
  res.json(JSON.parse(readFileSync(p, 'utf8')));
});

router.post('/:classId/lectures/:lectureId/qa/generate', async (req, res) => {
  const { classId, lectureId } = req.params;
  if (!getLecture(classId, lectureId)) return res.status(404).json({ error: 'Not found' });
  const summaryContent = getCurrentSummaryContent(classId, lectureId);
  if (!summaryContent) return res.status(400).json({ error: 'אין סיכום — צור סיכום תחילה' });
  try {
    const questions = await generateQuestions(summaryContent);
    const p = path.join(lectureDirPath(classId, lectureId), 'qa.json');
    const qa = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { rounds: [] };
    qa.rounds.push({ questions, answers: [], feedback: [], timestamp: new Date().toISOString() });
    writeFileSync(p, JSON.stringify(qa, null, 2));
    res.json({ questions, roundIndex: qa.rounds.length - 1 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:classId/lectures/:lectureId/qa/answer', async (req, res) => {
  const { classId, lectureId } = req.params;
  const { roundIndex, answers } = req.body;
  if (!getLecture(classId, lectureId)) return res.status(404).json({ error: 'Not found' });
  const p = path.join(lectureDirPath(classId, lectureId), 'qa.json');
  if (!existsSync(p)) return res.status(400).json({ error: 'אין סשן Q&A פעיל' });
  const qa = JSON.parse(readFileSync(p, 'utf8'));
  const round = qa.rounds[roundIndex];
  if (!round) return res.status(400).json({ error: 'סיבוב לא נמצא' });
  try {
    const feedback = await evaluateAnswers(round.questions, answers);
    round.answers = answers;
    round.feedback = feedback;
    writeFileSync(p, JSON.stringify(qa, null, 2));
    res.json({ feedback });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Skip / Unskip ─────────────────────────────────────────────────────────────
router.post('/:classId/lectures/:lectureId/skip', (req, res) => {
  const { classId, lectureId } = req.params;
  const lecture = getLecture(classId, lectureId);
  if (!lecture) return res.status(404).json({ error: 'Not found' });
  if (lecture.status !== 'pending') return res.status(400).json({ error: 'Only pending lectures can be skipped' });
  res.json(updateLectureMeta(classId, lectureId, { status: 'skipped' }));
});

router.post('/:classId/lectures/:lectureId/unskip', (req, res) => {
  const { classId, lectureId } = req.params;
  const lecture = getLecture(classId, lectureId);
  if (!lecture) return res.status(404).json({ error: 'Not found' });
  if (lecture.status !== 'skipped') return res.status(400).json({ error: 'Only skipped lectures can be unskipped' });
  res.json(updateLectureMeta(classId, lectureId, { status: 'pending' }));
});

// ── Status ────────────────────────────────────────────────────────────────────
router.get('/:classId/lectures/:lectureId/status', (req, res) => {
  const { classId, lectureId } = req.params;
  const lecture = getLecture(classId, lectureId);
  if (!lecture) return res.status(404).json({ error: 'Not found' });
  res.json(lecture);
});

// ── Transcribe (SSE) ──────────────────────────────────────────────────────────
router.post('/:classId/lectures/:lectureId/transcribe', async (req, res) => {
  const { classId, lectureId } = req.params;
  const lecture = getLecture(classId, lectureId);
  if (!lecture) return res.status(404).json({ error: 'Not found' });

  const key = `${classId}/${lectureId}`;

  if (activeJobs.has(key)) {
    attachSSEClient(activeJobs.get(key), res, req);
    return;
  }

  const bus = new EventEmitter();
  bus.setMaxListeners(20);
  activeJobs.set(key, bus);
  attachSSEClient(bus, res, req);
  const broadcast = (data) => bus.emit('event', data);

  const controller = new AbortController();
  const abortKey = `${key}:transcribe`;
  activeAbortControllers.set(abortKey, controller);

  const dir = lectureDirPath(classId, lectureId);
  const transcriptPath = path.join(dir, 'transcript.txt');
  const mp3Path = path.join(dir, 'audio.mp3');

  try {
    updateLectureMeta(classId, lectureId, { status: 'transcribing' });

    broadcast({ type: 'progress', step: 'login', message: 'מתחבר לאוניברסיטה הפתוחה...' });
    const videoUrl = await extractVideoUrl(
      lecture.url,
      (msg) => broadcast({ type: 'progress', step: 'login', message: msg }),
      controller.signal,
    );

    broadcast({ type: 'progress', step: 'download', message: 'מוריד ומתמלל...' });
    const maxDuration = req.body?.test ? 1800 : null;
    const transcript = await downloadAndTranscribe(
      videoUrl,
      (msg) => broadcast({ type: 'progress', step: 'transcribe', message: msg }),
      null,
      mp3Path,
      maxDuration,
      controller.signal,
    );

    writeFileSync(transcriptPath, transcript);

    if (process.env.DELETE_MP3_AFTER_TRANSCRIBE === 'true' && existsSync(mp3Path)) {
      unlinkSync(mp3Path);
      console.log('[pipeline] deleted audio.mp3 after transcript saved');
    }

    updateLectureMeta(classId, lectureId, {
      status: 'transcribed',
      whisperModel: WHISPER_MODEL,
      whisperBackend: WHISPER_BACKEND,
    });

    broadcast({ type: 'done', status: 'transcribed' });
  } catch (err) {
    const aborted = controller.signal.aborted;
    if (aborted) console.log(`[transcribe] aborted: ${classId}/${lectureId}`);
    else console.error(`[transcribe] error: ${classId}/${lectureId}`, err.message);
    updateLectureMeta(classId, lectureId, { status: aborted ? 'aborted' : 'error' });
    broadcast({ type: aborted ? 'aborted' : 'error', message: err.message });
  } finally {
    activeAbortControllers.delete(abortKey);
    activeJobs.delete(key);
    bus.emit('end');
  }
});

// ── Summarize (SSE) ───────────────────────────────────────────────────────────
router.post('/:classId/lectures/:lectureId/summarize', async (req, res) => {
  const { classId, lectureId } = req.params;
  const lecture = getLecture(classId, lectureId);
  if (!lecture) return res.status(404).json({ error: 'Not found' });

  const dir = lectureDirPath(classId, lectureId);
  const transcriptPath = path.join(dir, 'transcript.txt');

  if (!existsSync(transcriptPath) || readFileSync(transcriptPath).length === 0) {
    return res.status(400).json({ error: 'No transcript found. Run transcription first.' });
  }

  const send = startSSE(res);
  const backend = req.body?.backend;
  const usedBackend = backend || SUMMARIZE_BACKEND;

  const controller = new AbortController();
  const abortKey = `${classId}/${lectureId}:summarize`;
  activeAbortControllers.set(abortKey, controller);

  try {
    updateLectureMeta(classId, lectureId, { status: 'summarizing' });
    const { mergeSummaries } = await getSummarizer(backend);
    const transcript = readFileSync(transcriptPath, 'utf8');
    send({ type: 'progress', step: 'summarize', message: 'מסכם...' });

    const summary = await withAbort(
      mergeSummaries(
        [transcript],
        (msg) => send({ type: 'progress', step: 'summarize', message: msg }),
        (token) => send({ type: 'token', token }),
      ),
      controller.signal,
    );

    const summaryId = saveSummaryVersion(classId, lectureId, summary, usedBackend);
    updateLectureMeta(classId, lectureId, {
      status: 'summarized',
      summarizedAt: new Date().toISOString(),
      summarizeBackend: usedBackend,
    });

    send({ type: 'done', summary, status: 'summarized' });
  } catch (err) {
    const aborted = controller.signal.aborted;
    updateLectureMeta(classId, lectureId, { status: aborted ? 'aborted' : 'error' });
    send({ type: aborted ? 'aborted' : 'error', message: err.message });
  } finally {
    activeAbortControllers.delete(abortKey);
    res.end();
  }
});

// ── Abort ─────────────────────────────────────────────────────────────────────
router.post('/:classId/lectures/:lectureId/abort', (req, res) => {
  const { classId, lectureId } = req.params;
  const { type } = req.body;
  if (!type || !['transcribe', 'summarize'].includes(type)) {
    return res.status(400).json({ error: 'type must be transcribe or summarize' });
  }
  const controller = activeAbortControllers.get(`${classId}/${lectureId}:${type}`);
  if (!controller) return res.status(404).json({ error: 'No active job' });
  controller.abort();
  res.json({ ok: true });
});

// ── Files ─────────────────────────────────────────────────────────────────────
router.get('/:classId/lectures/:lectureId/transcript', (req, res) => {
  const { classId, lectureId } = req.params;
  const p = path.join(lectureDirPath(classId, lectureId), 'transcript.txt');
  if (!existsSync(p)) return res.status(404).json({ error: 'No transcript' });
  res.type('text/plain').send(readFileSync(p, 'utf8'));
});

router.get('/:classId/lectures/:lectureId/summary', (req, res) => {
  const { classId, lectureId } = req.params;
  const content = getCurrentSummaryContent(classId, lectureId);
  if (content === null) return res.status(404).json({ error: 'No summary' });
  res.type('text/plain').send(content);
});

router.get('/:classId/lectures/:lectureId/summaries', (req, res) => {
  const { classId, lectureId } = req.params;
  if (!getLecture(classId, lectureId)) return res.status(404).json({ error: 'Not found' });
  res.json(getSummaryVersions(classId, lectureId));
});

router.get('/:classId/lectures/:lectureId/summaries/:summaryId', (req, res) => {
  const { classId, lectureId, summaryId } = req.params;
  const content = getSummaryContent(classId, lectureId, summaryId);
  if (content === null) return res.status(404).json({ error: 'Not found' });
  res.type('text/plain').send(content);
});

router.put('/:classId/lectures/:lectureId/summaries/:summaryId/current', (req, res) => {
  const { classId, lectureId, summaryId } = req.params;
  if (!setCurrentSummary(classId, lectureId, summaryId)) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

router.delete('/:classId/lectures/:lectureId/summaries/:summaryId', (req, res) => {
  const { classId, lectureId, summaryId } = req.params;
  if (!deleteSummaryVersion(classId, lectureId, summaryId)) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

export default router;
