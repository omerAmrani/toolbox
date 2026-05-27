import { Controller, Get, Post, Patch, Delete, Put, Param, Body, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { EventEmitter } from 'events';
import path from 'path';
import { LecturesService } from './lectures.service';
import { StorageService } from '../storage/storage.service';
import { DownloadService } from '../download/download.service';
import { SummarizeService } from '../summarize/summarize.service';
import { QaService } from '../qa/qa.service';
import { WHISPER_BACKEND, WHISPER_MODEL, SUMMARIZE_BACKEND } from '../../config';

@Controller('api/classes')
export class LecturesController {
  constructor(
    private readonly lecturesService: LecturesService,
    private readonly storage: StorageService,
    private readonly download: DownloadService,
    private readonly summarizeService: SummarizeService,
    private readonly qa: QaService,
  ) {}

  private requireLecture(classId: string, lectureId: string, res: Response) {
    const lecture = this.storage.getLecture(classId, lectureId);
    if (!lecture) res.status(404).json({ error: 'Not found' });
    return lecture ?? null;
  }

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

  // ── Lectures CRUD ─────────────────────────────────────────────────────────────

  @Get(':classId/lectures')
  getLectures(@Param('classId') classId: string, @Res() res: Response) {
    if (!this.storage.getClass(classId)) return res.status(404).json({ error: 'Class not found' });
    res.json(this.storage.getLectures(classId));
  }

  @Post(':classId/lectures')
  createLecture(@Param('classId') classId: string, @Body() body: any, @Res() res: Response) {
    if (!this.storage.getClass(classId)) return res.status(404).json({ error: 'Class not found' });
    const { name, url, lectureDate, status } = body;
    if (!name || !url) return res.status(400).json({ error: 'name and url required' });
    const allowed = ['pending', 'skipped'];
    const initialStatus = allowed.includes(status) ? status : 'pending';
    res.status(201).json(this.storage.createLecture(classId, { name, url, lectureDate, status: initialStatus }));
  }

  @Delete(':classId/lectures/:lectureId')
  deleteLecture(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Res() res: Response) {
    if (!this.storage.deleteLecture(classId, lectureId)) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  }

  @Patch(':classId/lectures/:lectureId')
  updateLecture(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Body() body: any, @Res() res: Response) {
    if (!this.requireLecture(classId, lectureId, res)) return;
    const { name, lectureDate } = body;
    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (lectureDate !== undefined) updates.lectureDate = lectureDate;
    res.json(this.storage.updateLectureMeta(classId, lectureId, updates));
  }

  // ── Retry / Skip / Unskip ─────────────────────────────────────────────────────

  @Post(':classId/lectures/:lectureId/retry')
  retryLecture(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Res() res: Response) {
    const lecture = this.requireLecture(classId, lectureId, res);
    if (!lecture) return;
    if (lecture.status !== 'failed') return res.status(400).json({ error: 'Only failed lectures can be retried' });
    res.json(this.storage.updateLectureMeta(classId, lectureId, { status: 'pending', lastError: null, lastErrorAt: null, startedAt: null }));
  }

  @Post(':classId/lectures/:lectureId/skip')
  skipLecture(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Res() res: Response) {
    const lecture = this.requireLecture(classId, lectureId, res);
    if (!lecture) return;
    if (lecture.status !== 'pending') return res.status(400).json({ error: 'Only pending lectures can be skipped' });
    res.json(this.storage.updateLectureMeta(classId, lectureId, { status: 'skipped' }));
  }

  @Post(':classId/lectures/:lectureId/unskip')
  unskipLecture(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Res() res: Response) {
    const lecture = this.requireLecture(classId, lectureId, res);
    if (!lecture) return;
    if (lecture.status !== 'skipped') return res.status(400).json({ error: 'Only skipped lectures can be unskipped' });
    res.json(this.storage.updateLectureMeta(classId, lectureId, { status: 'pending' }));
  }

  // ── Status ───────────────────────────────────────────────────────────────────

  @Get(':classId/lectures/:lectureId/status')
  getLectureStatus(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Res() res: Response) {
    const lecture = this.requireLecture(classId, lectureId, res);
    if (!lecture) return;
    res.json(lecture);
  }

  // ── Q&A ─────────────────────────────────────────────────────────────────────

  @Get(':classId/lectures/:lectureId/qa')
  getQA(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Res() res: Response) {
    if (!this.requireLecture(classId, lectureId, res)) return;
    const p = path.join(this.storage.lectureDirPath(classId, lectureId), 'qa.json');
    if (!existsSync(p)) return res.json({ rounds: [] });
    res.json(JSON.parse(readFileSync(p, 'utf8')));
  }

  @Post(':classId/lectures/:lectureId/qa/generate')
  async generateQA(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Res() res: Response) {
    if (!this.requireLecture(classId, lectureId, res)) return;
    const summaryContent = this.storage.getCurrentSummaryContent(classId, lectureId);
    if (!summaryContent) return res.status(400).json({ error: 'אין סיכום — צור סיכום תחילה' });
    try {
      const questions = await this.qa.generateQuestions(summaryContent);
      const p = path.join(this.storage.lectureDirPath(classId, lectureId), 'qa.json');
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
    if (!this.requireLecture(classId, lectureId, res)) return;
    const p = path.join(this.storage.lectureDirPath(classId, lectureId), 'qa.json');
    if (!existsSync(p)) return res.status(400).json({ error: 'אין סשן Q&A פעיל' });
    const qa = JSON.parse(readFileSync(p, 'utf8'));
    const round = qa.rounds[roundIndex];
    if (!round) return res.status(400).json({ error: 'סיבוב לא נמצא' });
    try {
      const feedback = await this.qa.evaluateAnswers(round.questions, answers);
      round.answers = answers;
      round.feedback = feedback;
      writeFileSync(p, JSON.stringify(qa, null, 2));
      res.json({ feedback });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
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
    const lecture = this.requireLecture(classId, lectureId, res);
    if (!lecture) return;

    const key = `${classId}/${lectureId}`;

    if (this.lecturesService.activeJobs.has(key)) {
      this.attachSSEClient(this.lecturesService.activeJobs.get(key)!.bus!, res, req);
      return;
    }

    const bus = new EventEmitter();
    bus.setMaxListeners(20);
    const controller = new AbortController();
    this.lecturesService.activeJobs.set(key, { bus, controllers: new Map([['transcribe', controller]]) });
    this.attachSSEClient(bus, res, req);
    const broadcast = (data: any) => bus.emit('event', data);

    const dir = this.storage.lectureDirPath(classId, lectureId);
    const transcriptPath = path.join(dir, 'transcript.txt');
    const mp3Path = path.join(dir, 'audio.mp3');

    try {
      this.storage.updateLectureMeta(classId, lectureId, { status: 'transcribing' });

      broadcast({ type: 'progress', step: 'login', message: 'מתחבר לאוניברסיטה הפתוחה...' });
      const videoUrl = await this.download.extractVideoUrl(
        lecture.url,
        (msg: string) => broadcast({ type: 'progress', step: 'login', message: msg }),
        controller.signal,
      );

      broadcast({ type: 'progress', step: 'download', message: 'מוריד ומתמלל...' });
      const maxDuration = body?.test ? 1800 : null;
      const transcript = await this.download.downloadAndTranscribe(
        videoUrl,
        (msg: string) => broadcast({ type: 'progress', step: 'transcribe', message: msg }),
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

      this.storage.updateLectureMeta(classId, lectureId, {
        status: 'transcribed',
        whisperModel: WHISPER_MODEL,
        whisperBackend: WHISPER_BACKEND,
      });

      broadcast({ type: 'done', status: 'transcribed' });
    } catch (err: any) {
      const aborted = controller.signal.aborted;
      if (aborted) console.log(`[transcribe] aborted: ${classId}/${lectureId}`);
      else console.error(`[transcribe] error: ${classId}/${lectureId}`, err.message);
      this.storage.updateLectureMeta(classId, lectureId, { status: aborted ? 'aborted' : 'error' });
      broadcast({ type: aborted ? 'aborted' : 'error', message: err.message });
    } finally {
      this.lecturesService.activeJobs.delete(key);
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
    if (!this.requireLecture(classId, lectureId, res)) return;

    const dir = this.storage.lectureDirPath(classId, lectureId);
    const transcriptPath = path.join(dir, 'transcript.txt');

    if (!existsSync(transcriptPath) || readFileSync(transcriptPath).length === 0) {
      return res.status(400).json({ error: 'No transcript found. Run transcription first.' });
    }

    const send = this.startSSE(res);
    const backend = body?.backend;
    const usedBackend = backend || SUMMARIZE_BACKEND;
    const key = `${classId}/${lectureId}`;

    const controller = new AbortController();
    const job = this.lecturesService.activeJobs.get(key) ?? { controllers: new Map<string, AbortController>() };
    job.controllers.set('summarize', controller);
    this.lecturesService.activeJobs.set(key, job);

    try {
      this.storage.updateLectureMeta(classId, lectureId, { status: 'summarizing' });
      const { mergeSummaries } = await this.summarizeService.getSummarizer(backend);
      const transcript = readFileSync(transcriptPath, 'utf8');
      send({ type: 'progress', step: 'summarize', message: 'מסכם...' });

      const summary = await this.summarizeService.withAbort(
        mergeSummaries(
          [transcript],
          (msg: string) => send({ type: 'progress', step: 'summarize', message: msg }),
          (token: string) => send({ type: 'token', token }),
        ),
        controller.signal,
      );

      this.storage.saveSummaryVersion(classId, lectureId, summary, usedBackend!);
      this.storage.updateLectureMeta(classId, lectureId, {
        status: 'summarized',
        summarizedAt: new Date().toISOString(),
        summarizeBackend: usedBackend,
      });

      send({ type: 'done', summary, status: 'summarized' });
    } catch (err: any) {
      const aborted = controller.signal.aborted;
      this.storage.updateLectureMeta(classId, lectureId, { status: aborted ? 'aborted' : 'error' });
      send({ type: aborted ? 'aborted' : 'error', message: err.message });
    } finally {
      const j = this.lecturesService.activeJobs.get(key);
      j?.controllers.delete('summarize');
      if (j && !j.bus && !j.controllers.size) this.lecturesService.activeJobs.delete(key);
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
    const controller = this.lecturesService.activeJobs.get(`${classId}/${lectureId}`)?.controllers.get(type);
    if (!controller) return res.status(404).json({ error: 'No active job' });
    controller.abort();
    res.json({ ok: true });
  }

  // ── Files ─────────────────────────────────────────────────────────────────────

  @Get(':classId/lectures/:lectureId/transcript')
  getTranscript(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Res() res: Response) {
    const p = path.join(this.storage.lectureDirPath(classId, lectureId), 'transcript.txt');
    if (!existsSync(p)) return res.status(404).json({ error: 'No transcript' });
    res.type('text/plain').send(readFileSync(p, 'utf8'));
  }

  @Get(':classId/lectures/:lectureId/summary')
  getSummary(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Res() res: Response) {
    const content = this.storage.getCurrentSummaryContent(classId, lectureId);
    if (content === null) return res.status(404).json({ error: 'No summary' });
    res.type('text/plain').send(content);
  }

  @Get(':classId/lectures/:lectureId/summaries')
  getSummaries(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Res() res: Response) {
    if (!this.requireLecture(classId, lectureId, res)) return;
    res.json(this.storage.getSummaryVersions(classId, lectureId));
  }

  @Get(':classId/lectures/:lectureId/summaries/:summaryId')
  getSummaryById(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Param('summaryId') summaryId: string, @Res() res: Response) {
    const content = this.storage.getSummaryContent(classId, lectureId, summaryId);
    if (content === null) return res.status(404).json({ error: 'Not found' });
    res.type('text/plain').send(content);
  }

  @Put(':classId/lectures/:lectureId/summaries/:summaryId/current')
  setCurrentSummary(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Param('summaryId') summaryId: string, @Res() res: Response) {
    if (!this.storage.setCurrentSummary(classId, lectureId, summaryId)) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  }

  @Delete(':classId/lectures/:lectureId/summaries/:summaryId')
  deleteSummary(@Param('classId') classId: string, @Param('lectureId') lectureId: string, @Param('summaryId') summaryId: string, @Res() res: Response) {
    if (!this.storage.deleteSummaryVersion(classId, lectureId, summaryId)) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  }
}
