import { Controller, Get, Post, Patch, Delete, Put, Param, Body, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { EventEmitter } from 'events';
import path from 'path';
import { ClassesService } from './classes.service';
import {
  createClass, getClasses, getClass, deleteClass, updateClassMeta,
  createLecture, getLectures, getLecture, updateLectureMeta, deleteLecture,
  lectureDirPath, CLASSES_DIR,
  saveSummaryVersion, getSummaryVersions, getSummaryContent,
  getCurrentSummaryContent, setCurrentSummary, deleteSummaryVersion,
} from '../../storage';
import { detectNewLectures } from '../../../lib/detect';
import { runQueue, isQueueRunning, runFullPipeline, getLastCronLog } from '../../../lib/pipeline';
import { sendLectureSummary } from '../../../lib/email';
import { generateQuestions, evaluateAnswers } from '../../../lib/qa';
import { extractVideoUrl } from '../../../lib/extract';
import { downloadAndTranscribe } from '../../../lib/download';
import { getSummarizer, withAbort } from '../../../lib/summarize';
import { WHISPER_BACKEND, WHISPER_MODEL, SUMMARIZE_BACKEND } from '../../../lib/config';

@Controller('api/classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  private startSSE(res: Response): (data: any) => void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    return (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  private attachSSEClient(bus: EventEmitter, res: Response, req: Request): void {
    const send = this.startSSE(res);
    const onEvent = (data: any) => { try { send(data); } catch (_) {} };
    const onEnd = () => { bus.off('event', onEvent); bus.off('end', onEnd); try { res.end(); } catch (_) {} };
    bus.on('event', onEvent);
    bus.on('end', onEnd);
    req.on('close', () => { bus.off('event', onEvent); bus.off('end', onEnd); });
  }

  // ── Classes ─────────────────────────────────────────────────────────────────

  @Get()
  listClasses(@Res() res: Response) {
    const classes = getClasses();
    res.json(classes.map((c: any) => ({ ...c, lectureCount: getLectures(c.id).length })));
  }

  @Post()
  createClass(@Body() body: any, @Res() res: Response) {
    const { name, semester, year } = body;
    if (!name) return res.status(400).json({ error: 'name required' });
    res.status(201).json(createClass({ name, semester, year }));
  }

  @Get('queue')
  getQueue(@Res() res: Response) {
    const classes = getClasses();
    const rows: any[] = [];
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
  }

  @Post('run-queue')
  runQueue(@Res() res: Response) {
    if (isQueueRunning()) return res.json({ ok: true, message: 'already running' });
    runQueue((msg) => console.log('[queue]', msg));
    res.json({ ok: true });
  }

  @Post('test-email')
  async testEmail(@Body() body: any, @Res() res: Response) {
    const { classId, lectureId } = body;
    if (!classId || !lectureId) return res.status(400).json({ error: 'classId and lectureId required' });
    const cls = getClass(classId);
    const lecture = getLecture(classId, lectureId);
    if (!cls || !lecture) return res.status(404).json({ error: 'Not found' });
    const summaryContent = getCurrentSummaryContent(classId, lectureId);
    if (!summaryContent) return res.status(400).json({ error: 'No summary found for this lecture' });
    try {
      await sendLectureSummary({ className: cls.name, lectureName: lecture.name, lectureDate: lecture.lectureDate, summaryContent });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  @Post('run-pipeline')
  runPipeline(@Res() res: Response) {
    if (isQueueRunning()) return res.json({ ok: true, message: 'already running' });
    runFullPipeline((msg) => console.log('[pipeline]', msg));
    res.json({ ok: true });
  }

  @Get('cron-log')
  getCronLog(@Res() res: Response) {
    res.json(getLastCronLog());
  }

  @Post('sync')
  async sync(@Req() req: Request, @Res() res: Response) {
    const send = this.startSSE(res);
    const classes = getClasses().filter((c: any) => c.opalCourseUrl);

    if (!classes.length) {
      send({ type: 'done', results: [], message: 'אין קורסים עם קישור OPAL מוגדר' });
      return res.end();
    }

    const results: any[] = [];
    for (const cls of classes) {
      try {
        send({ type: 'progress', message: `בודק: ${cls.name}...` });
        const newLectures = await detectNewLectures(cls.id, (msg: string) => send({ type: 'progress', message: msg }));
        results.push({ classId: cls.id, className: cls.name, newLectures });
        send({ type: 'class', classId: cls.id, className: cls.name, newLectures });
      } catch (err: any) {
        results.push({ classId: cls.id, className: cls.name, error: err.message });
        send({ type: 'class', classId: cls.id, className: cls.name, error: err.message, newLectures: [] });
      }
    }

    send({ type: 'done', results });
    res.end();
  }

  @Patch(':classId')
  updateClass(@Param('classId') classId: string, @Body() body: any, @Res() res: Response) {
    if (!getClass(classId)) return res.status(404).json({ error: 'Not found' });
    const { opalCourseUrl } = body;
    const updates: Record<string, any> = {};
    if (opalCourseUrl !== undefined) updates.opalCourseUrl = opalCourseUrl;
    res.json(updateClassMeta(classId, updates));
  }

  @Delete(':classId')
  deleteClass(@Param('classId') classId: string, @Res() res: Response) {
    if (!deleteClass(classId)) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  }

  // ── Lectures ─────────────────────────────────────────────────────────────────

  @Get(':classId/lectures')
  getLectures(@Param('classId') classId: string, @Res() res: Response) {
    if (!getClass(classId)) return res.status(404).json({ error: 'Class not found' });
    res.json(getLectures(classId));
  }

  @Post(':classId/lectures')
  createLecture(@Param('classId') classId: string, @Body() body: any, @Res() res: Response) {
    if (!getClass(classId)) return res.status(404).json({ error: 'Class not found' });
    const { name, url, lectureDate, status } = body;
    if (!name || !url) return res.status(400).json({ error: 'name and url required' });
    const allowed = ['pending', 'skipped'];
    const initialStatus = allowed.includes(status) ? status : 'pending';
    res.status(201).json(createLecture(classId, { name, url, lectureDate, status: initialStatus }));
  }

  @Delete(':classId/lectures/:lectureId')
  deleteLecture(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Res() res: Response) {
    if (!deleteLecture(classId, lectureId)) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  }

  @Patch(':classId/lectures/:lectureId')
  updateLecture(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Body() body: any, @Res() res: Response) {
    if (!getLecture(classId, lectureId)) return res.status(404).json({ error: 'Not found' });
    const { name, lectureDate } = body;
    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (lectureDate !== undefined) updates.lectureDate = lectureDate;
    res.json(updateLectureMeta(classId, lectureId, updates));
  }

  // ── Retry ───────────────────────────────────────────────────────────────────

  @Post(':classId/lectures/:lectureId/retry')
  retryLecture(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Res() res: Response) {
    const lecture = getLecture(classId, lectureId);
    if (!lecture) return res.status(404).json({ error: 'Not found' });
    if (lecture.status !== 'failed') return res.status(400).json({ error: 'Only failed lectures can be retried' });
    res.json(updateLectureMeta(classId, lectureId, { status: 'pending', lastError: null, lastErrorAt: null, startedAt: null }));
  }

  // ── Q&A ─────────────────────────────────────────────────────────────────────

  @Get(':classId/lectures/:lectureId/qa')
  getQA(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Res() res: Response) {
    if (!getLecture(classId, lectureId)) return res.status(404).json({ error: 'Not found' });
    const p = path.join(lectureDirPath(classId, lectureId), 'qa.json');
    if (!existsSync(p)) return res.json({ rounds: [] });
    res.json(JSON.parse(readFileSync(p, 'utf8')));
  }

  @Post(':classId/lectures/:lectureId/qa/generate')
  async generateQA(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Res() res: Response) {
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
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  @Post(':classId/lectures/:lectureId/qa/answer')
  async answerQA(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Body() body: any, @Res() res: Response) {
    const { roundIndex, answers } = body;
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
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // ── Skip / Unskip ────────────────────────────────────────────────────────────

  @Post(':classId/lectures/:lectureId/skip')
  skipLecture(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Res() res: Response) {
    const lecture = getLecture(classId, lectureId);
    if (!lecture) return res.status(404).json({ error: 'Not found' });
    if (lecture.status !== 'pending') return res.status(400).json({ error: 'Only pending lectures can be skipped' });
    res.json(updateLectureMeta(classId, lectureId, { status: 'skipped' }));
  }

  @Post(':classId/lectures/:lectureId/unskip')
  unskipLecture(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Res() res: Response) {
    const lecture = getLecture(classId, lectureId);
    if (!lecture) return res.status(404).json({ error: 'Not found' });
    if (lecture.status !== 'skipped') return res.status(400).json({ error: 'Only skipped lectures can be unskipped' });
    res.json(updateLectureMeta(classId, lectureId, { status: 'pending' }));
  }

  // ── Status ───────────────────────────────────────────────────────────────────

  @Get(':classId/lectures/:lectureId/status')
  getLectureStatus(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Res() res: Response) {
    const lecture = getLecture(classId, lectureId);
    if (!lecture) return res.status(404).json({ error: 'Not found' });
    res.json(lecture);
  }

  // ── Transcribe (SSE) ──────────────────────────────────────────────────────────

  @Post(':classId/lectures/:lectureId/transcribe')
  async transcribe(
    @Param('classId') classId: string,
    @Param('lectureId') lectureId: string,
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const lecture = getLecture(classId, lectureId);
    if (!lecture) return res.status(404).json({ error: 'Not found' });

    const key = `${classId}/${lectureId}`;

    if (this.classesService.activeJobs.has(key)) {
      this.attachSSEClient(this.classesService.activeJobs.get(key)!, res, req);
      return;
    }

    const bus = new EventEmitter();
    bus.setMaxListeners(20);
    this.classesService.activeJobs.set(key, bus);
    this.attachSSEClient(bus, res, req);
    const broadcast = (data: any) => bus.emit('event', data);

    const controller = new AbortController();
    const abortKey = `${key}:transcribe`;
    this.classesService.activeAbortControllers.set(abortKey, controller);

    const dir = lectureDirPath(classId, lectureId);
    const transcriptPath = path.join(dir, 'transcript.txt');
    const mp3Path = path.join(dir, 'audio.mp3');

    try {
      updateLectureMeta(classId, lectureId, { status: 'transcribing' });

      broadcast({ type: 'progress', step: 'login', message: 'מתחבר לאוניברסיטה הפתוחה...' });
      const videoUrl = await extractVideoUrl(
        lecture.url,
        (msg: string) => broadcast({ type: 'progress', step: 'login', message: msg }),
        controller.signal,
      );

      broadcast({ type: 'progress', step: 'download', message: 'מוריד ומתמלל...' });
      const maxDuration = body?.test ? 1800 : null;
      const transcript = await downloadAndTranscribe(
        videoUrl,
        (msg: string) => broadcast({ type: 'progress', step: 'transcribe', message: msg }),
        null,
        mp3Path,
        maxDuration,
        controller.signal,
      );

      writeFileSync(transcriptPath, transcript);

      if (process.env.DELETE_MP3_AFTER_TRANSCRIBE === 'true' && existsSync(mp3Path)) {
        const { unlinkSync } = require('fs');
        unlinkSync(mp3Path);
        console.log('[pipeline] deleted audio.mp3 after transcript saved');
      }

      updateLectureMeta(classId, lectureId, {
        status: 'transcribed',
        whisperModel: WHISPER_MODEL,
        whisperBackend: WHISPER_BACKEND,
      });

      broadcast({ type: 'done', status: 'transcribed' });
    } catch (err: any) {
      const aborted = controller.signal.aborted;
      if (aborted) console.log(`[transcribe] aborted: ${classId}/${lectureId}`);
      else console.error(`[transcribe] error: ${classId}/${lectureId}`, err.message);
      updateLectureMeta(classId, lectureId, { status: aborted ? 'aborted' : 'error' });
      broadcast({ type: aborted ? 'aborted' : 'error', message: err.message });
    } finally {
      this.classesService.activeAbortControllers.delete(abortKey);
      this.classesService.activeJobs.delete(key);
      bus.emit('end');
    }
  }

  // ── Summarize (SSE) ───────────────────────────────────────────────────────────

  @Post(':classId/lectures/:lectureId/summarize')
  async summarize(
    @Param('classId') classId: string,
    @Param('lectureId') lectureId: string,
    @Body() body: any,
    @Res() res: Response,
  ) {
    const lecture = getLecture(classId, lectureId);
    if (!lecture) return res.status(404).json({ error: 'Not found' });

    const dir = lectureDirPath(classId, lectureId);
    const transcriptPath = path.join(dir, 'transcript.txt');

    if (!existsSync(transcriptPath) || readFileSync(transcriptPath).length === 0) {
      return res.status(400).json({ error: 'No transcript found. Run transcription first.' });
    }

    const send = this.startSSE(res);
    const backend = body?.backend;
    const usedBackend = backend || SUMMARIZE_BACKEND;

    const controller = new AbortController();
    const abortKey = `${classId}/${lectureId}:summarize`;
    this.classesService.activeAbortControllers.set(abortKey, controller);

    try {
      updateLectureMeta(classId, lectureId, { status: 'summarizing' });
      const { mergeSummaries } = await getSummarizer(backend);
      const transcript = readFileSync(transcriptPath, 'utf8');
      send({ type: 'progress', step: 'summarize', message: 'מסכם...' });

      const summary = await withAbort(
        mergeSummaries(
          [transcript],
          (msg: string) => send({ type: 'progress', step: 'summarize', message: msg }),
          (token: string) => send({ type: 'token', token }),
        ),
        controller.signal,
      );

      saveSummaryVersion(classId, lectureId, summary, usedBackend!);
      updateLectureMeta(classId, lectureId, {
        status: 'summarized',
        summarizedAt: new Date().toISOString(),
        summarizeBackend: usedBackend,
      });

      send({ type: 'done', summary, status: 'summarized' });
    } catch (err: any) {
      const aborted = controller.signal.aborted;
      updateLectureMeta(classId, lectureId, { status: aborted ? 'aborted' : 'error' });
      send({ type: aborted ? 'aborted' : 'error', message: err.message });
    } finally {
      this.classesService.activeAbortControllers.delete(abortKey);
      res.end();
    }
  }

  // ── Abort ─────────────────────────────────────────────────────────────────────

  @Post(':classId/lectures/:lectureId/abort')
  abortLecture(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Body() body: any, @Res() res: Response) {
    const { type } = body;
    if (!type || !['transcribe', 'summarize'].includes(type)) {
      return res.status(400).json({ error: 'type must be transcribe or summarize' });
    }
    const controller = this.classesService.activeAbortControllers.get(`${classId}/${lectureId}:${type}`);
    if (!controller) return res.status(404).json({ error: 'No active job' });
    controller.abort();
    res.json({ ok: true });
  }

  // ── Files ─────────────────────────────────────────────────────────────────────

  @Get(':classId/lectures/:lectureId/transcript')
  getTranscript(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Res() res: Response) {
    const p = path.join(lectureDirPath(classId, lectureId), 'transcript.txt');
    if (!existsSync(p)) return res.status(404).json({ error: 'No transcript' });
    res.type('text/plain').send(readFileSync(p, 'utf8'));
  }

  @Get(':classId/lectures/:lectureId/summary')
  getSummary(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Res() res: Response) {
    const content = getCurrentSummaryContent(classId, lectureId);
    if (content === null) return res.status(404).json({ error: 'No summary' });
    res.type('text/plain').send(content);
  }

  @Get(':classId/lectures/:lectureId/summaries')
  getSummaries(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Res() res: Response) {
    if (!getLecture(classId, lectureId)) return res.status(404).json({ error: 'Not found' });
    res.json(getSummaryVersions(classId, lectureId));
  }

  @Get(':classId/lectures/:lectureId/summaries/:summaryId')
  getSummaryById(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Param('summaryId') summaryId: string, @Res() res: Response) {
    const content = getSummaryContent(classId, lectureId, summaryId);
    if (content === null) return res.status(404).json({ error: 'Not found' });
    res.type('text/plain').send(content);
  }

  @Put(':classId/lectures/:lectureId/summaries/:summaryId/current')
  setCurrentSummary(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Param('summaryId') summaryId: string, @Res() res: Response) {
    if (!setCurrentSummary(classId, lectureId, summaryId)) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  }

  @Delete(':classId/lectures/:lectureId/summaries/:summaryId')
  deleteSummary(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Param('summaryId') summaryId: string, @Res() res: Response) {
    if (!deleteSummaryVersion(classId, lectureId, summaryId)) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  }
}
