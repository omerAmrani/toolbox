import { Controller, Get, Post, Patch, Delete, Param, Body, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { EventEmitter } from 'events';
import path from 'path';
import { LecturesService } from './lectures.service';
import { StorageService } from '../storage/storage.service';
import { DownloadService } from '../download/download.service';
import { SummarizeService } from '../summarize/summarize.service';
import { SUMMARIZE_BACKEND, GEMINI_MODEL, CLAUDE_MODEL } from '../../config';
import { OpalCredentials } from '../../credentials';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { tryAcquireJobSlot, releaseJobSlot } from '../../job-guard';

@Controller('api/classes')
@UseGuards(JwtAuthGuard)
export class LecturesController {
  constructor(
    private readonly lecturesService: LecturesService,
    private readonly storage: StorageService,
    private readonly download: DownloadService,
    private readonly summarizeService: SummarizeService,
  ) {}

  // Ownership gate: every endpoint below touches a classId, so every one
  // must confirm the caller owns that class before doing anything else.
  // A mismatch reads as 404, same as a missing class.
  private requireOwnedClass(classId: string, userId: string, res: Response): boolean {
    if (!this.storage.getClassForUser(classId, userId)) {
      res.status(404).json({ error: 'Class not found' });
      return false;
    }
    return true;
  }

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
  getLectures(@CurrentUser() userId: string, @Param('classId') classId: string, @Res() res: Response) {
    if (!this.requireOwnedClass(classId, userId, res)) return;
    res.json(this.storage.getLectures(classId));
  }

  @Post(':classId/lectures')
  createLecture(@CurrentUser() userId: string, @Param('classId') classId: string, @Body() body: any, @Res() res: Response) {
    if (!this.requireOwnedClass(classId, userId, res)) return;
    const { name, url, lectureDate } = body;
    if (!name || !url) return res.status(400).json({ error: 'name and url required' });
    res.status(201).json(this.storage.createLecture(classId, { name, url, lectureDate, status: 'pending' }));
  }

  @Patch(':classId/lectures/:lectureId')
  updateLecture(@CurrentUser() userId: string, @Param('classId') classId: string, @Param('lectureId') lectureId: string, @Body() body: any, @Res() res: Response) {
    if (!this.requireOwnedClass(classId, userId, res)) return;
    if (!this.requireLecture(classId, lectureId, res)) return;
    const { name, lectureDate } = body;
    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (lectureDate !== undefined) updates.lectureDate = lectureDate;
    res.json(this.storage.updateLectureMeta(classId, lectureId, updates));
  }

  // ── Status ───────────────────────────────────────────────────────────────────

  @Get(':classId/lectures/:lectureId/status')
  getLectureStatus(@CurrentUser() userId: string, @Param('classId') classId: string, @Param('lectureId') lectureId: string, @Res() res: Response) {
    if (!this.requireOwnedClass(classId, userId, res)) return;
    const lecture = this.requireLecture(classId, lectureId, res);
    if (!lecture) return;
    res.json(lecture);
  }

  // ── Transcribe (SSE) ──────────────────────────────────────────────────────────

  @Post(':classId/lectures/:lectureId/transcribe')
  async transcribe(
    @CurrentUser() userId: string,
    @Param('classId') classId: string,
    @Param('lectureId') lectureId: string,
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!this.requireOwnedClass(classId, userId, res)) return;
    const lecture = this.requireLecture(classId, lectureId, res);
    if (!lecture) return;

    const { opalUsername, opalPassword, opalId, groqApiKey } = body || {};
    if (!opalUsername || !opalPassword || !opalId) return res.status(400).json({ error: 'OPAL credentials required' });
    if (!groqApiKey) return res.status(400).json({ error: 'groqApiKey required' });
    // never persisted server-side — in-memory for this request only, see credentials.ts
    const opalCredentials: OpalCredentials = { username: opalUsername, password: opalPassword, id: opalId };

    const key = `${classId}/${lectureId}`;

    if (this.lecturesService.activeJobs.has(key)) {
      this.attachSSEClient(this.lecturesService.activeJobs.get(key)!.bus!, res, req);
      return;
    }

    if (!tryAcquireJobSlot(userId)) {
      return res.status(429).json({ error: 'כבר יש עבודה פעילה אחת בתהליך. המתן לסיומה.' });
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
      this.storage.updateLectureMeta(classId, lectureId, { status: 'transcribing', lastError: null, lastErrorAt: null });

      broadcast({ type: 'progress', step: 'login', message: 'מתחבר לאוניברסיטה הפתוחה...' });
      const videoUrl = await this.download.extractVideoUrl(
        lecture.url,
        opalCredentials,
        (msg: string) => broadcast({ type: 'progress', step: 'login', message: msg }),
        controller.signal,
      );

      broadcast({ type: 'progress', step: 'download', message: 'מוריד ומתמלל...' });
      const maxDuration = body?.test ? 1800 : null;
      const transcript = await this.download.downloadAndTranscribe(
        videoUrl,
        groqApiKey,
        (msg: string) => broadcast({ type: 'progress', step: 'transcribe', message: msg }),
        null,
        mp3Path,
        maxDuration,
        controller.signal,
      );

      writeFileSync(transcriptPath, transcript);

      if (existsSync(mp3Path)) {
        unlinkSync(mp3Path);
        console.log('[pipeline] deleted audio.mp3 after transcript saved');
      }

      this.storage.updateLectureMeta(classId, lectureId, {
        status: 'transcribed',
        whisperBackend: 'groq-whisper',
      });

      broadcast({ type: 'done', status: 'transcribed' });
    } catch (err: any) {
      const aborted = controller.signal.aborted;
      if (aborted) console.log(`[transcribe] aborted: ${classId}/${lectureId}`);
      else console.error(`[transcribe] error: ${classId}/${lectureId}`, err.message);
      this.storage.updateLectureMeta(classId, lectureId, {
        status: 'pending',
        lastError: aborted ? 'בוטל על ידי המשתמש' : err.message,
        lastErrorAt: new Date().toISOString(),
      });
      broadcast({ type: aborted ? 'aborted' : 'error', message: err.message });
    } finally {
      this.lecturesService.activeJobs.delete(key);
      releaseJobSlot(userId);
      bus.emit('end');
    }
  }

  // ── Summarize (SSE) ───────────────────────────────────────────────────────────

  @Post(':classId/lectures/:lectureId/summarize')
  async summarize(
    @CurrentUser() userId: string,
    @Param('classId') classId: string,
    @Param('lectureId') lectureId: string,
    @Body() body: any,
    @Res() res: Response,
  ) {
    if (!this.requireOwnedClass(classId, userId, res)) return;
    if (!this.requireLecture(classId, lectureId, res)) return;

    const dir = this.storage.lectureDirPath(classId, lectureId);
    const transcriptPath = path.join(dir, 'transcript.txt');

    if (!existsSync(transcriptPath) || readFileSync(transcriptPath).length === 0) {
      return res.status(400).json({ error: 'No transcript found. Run transcription first.' });
    }

    const backend = body?.backend;
    const usedBackend = backend || SUMMARIZE_BACKEND;
    const apiKey = usedBackend === 'claude' ? body?.anthropicApiKey : body?.geminiApiKey;
    if (!apiKey) return res.status(400).json({ error: `${usedBackend === 'claude' ? 'anthropicApiKey' : 'geminiApiKey'} required` });

    const send = this.startSSE(res);
    const key = `${classId}/${lectureId}`;

    const controller = new AbortController();
    const job = this.lecturesService.activeJobs.get(key) ?? { controllers: new Map<string, AbortController>() };
    job.controllers.set('summarize', controller);
    this.lecturesService.activeJobs.set(key, job);

    try {
      console.log(`[summarize] starting: ${classId}/${lectureId} backend=${usedBackend}`);
      this.storage.updateLectureMeta(classId, lectureId, { status: 'summarizing', lastError: null, lastErrorAt: null });
      const { mergeSummaries } = await this.summarizeService.getSummarizer(backend);
      const transcript = readFileSync(transcriptPath, 'utf8');
      send({ type: 'progress', step: 'summarize', message: 'מסכם...' });

      const summary = await this.summarizeService.withAbort(
        mergeSummaries(
          [transcript],
          apiKey,
          (msg: string) => send({ type: 'progress', step: 'summarize', message: msg }),
          (token: string) => send({ type: 'token', token }),
        ),
        controller.signal,
      );

      const modelMap: Record<string, string | undefined> = { gemini: GEMINI_MODEL, claude: CLAUDE_MODEL };
      const usedModel = modelMap[usedBackend!];
      this.storage.saveSummaryVersion(classId, lectureId, summary, usedBackend!, usedModel);
      this.storage.updateLectureMeta(classId, lectureId, {
        status: 'summarized',
        summarizedAt: new Date().toISOString(),
        summarizeBackend: usedBackend,
        summarizeModel: usedModel,
      });

      console.log(`[summarize] done: ${classId}/${lectureId}`);
      send({ type: 'done', summary, status: 'summarized' });
    } catch (err: any) {
      const aborted = controller.signal.aborted;
      if (aborted) console.log(`[summarize] aborted: ${classId}/${lectureId}`);
      else console.error(`[summarize] error: ${classId}/${lectureId}`, err.message);
      this.storage.updateLectureMeta(classId, lectureId, {
        status: 'transcribed',
        lastError: aborted ? 'בוטל על ידי המשתמש' : err.message,
        lastErrorAt: new Date().toISOString(),
      });
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
  abortLecture(@CurrentUser() userId: string, @Param('classId') classId: string, @Param('lectureId') lectureId: string, @Body() body: any, @Res() res: Response) {
    if (!this.requireOwnedClass(classId, userId, res)) return;
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
  getTranscript(@CurrentUser() userId: string, @Param('classId') classId: string, @Param('lectureId') lectureId: string, @Res() res: Response) {
    if (!this.requireOwnedClass(classId, userId, res)) return;
    const p = path.join(this.storage.lectureDirPath(classId, lectureId), 'transcript.txt');
    if (!existsSync(p)) return res.status(404).json({ error: 'No transcript' });
    res.type('text/plain').send(readFileSync(p, 'utf8'));
  }

  @Get(':classId/lectures/:lectureId/summary')
  getSummary(@CurrentUser() userId: string, @Param('classId') classId: string, @Param('lectureId') lectureId: string, @Res() res: Response) {
    if (!this.requireOwnedClass(classId, userId, res)) return;
    const content = this.storage.getCurrentSummaryContent(classId, lectureId);
    if (content === null) return res.status(404).json({ error: 'No summary' });
    res.type('text/plain').send(content);
  }

  @Get(':classId/lectures/:lectureId/summaries')
  getSummaries(@CurrentUser() userId: string, @Param('classId') classId: string, @Param('lectureId') lectureId: string, @Res() res: Response) {
    if (!this.requireOwnedClass(classId, userId, res)) return;
    if (!this.requireLecture(classId, lectureId, res)) return;
    res.json(this.storage.getSummaryVersions(classId, lectureId));
  }

  @Get(':classId/lectures/:lectureId/summaries/:summaryId')
  getSummaryById(@CurrentUser() userId: string, @Param('classId') classId: string, @Param('lectureId') lectureId: string, @Param('summaryId') summaryId: string, @Res() res: Response) {
    if (!this.requireOwnedClass(classId, userId, res)) return;
    const content = this.storage.getSummaryContent(classId, lectureId, summaryId);
    if (content === null) return res.status(404).json({ error: 'Not found' });
    res.type('text/plain').send(content);
  }

  @Delete(':classId/lectures/:lectureId/summaries/:summaryId')
  deleteSummary(@CurrentUser() userId: string, @Param('classId') classId: string, @Param('lectureId') lectureId: string, @Param('summaryId') summaryId: string, @Res() res: Response) {
    if (!this.requireOwnedClass(classId, userId, res)) return;
    if (!this.storage.deleteSummaryVersion(classId, lectureId, summaryId)) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  }
}
