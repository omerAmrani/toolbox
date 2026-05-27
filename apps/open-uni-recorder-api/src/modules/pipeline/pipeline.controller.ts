import { Controller, Get, Post, Body, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { PipelineService } from './pipeline.service';
import { StorageService } from '../storage/storage.service';
import { DetectService } from '../detect/detect.service';
import { EmailService } from '../email/email.service';

@Controller('api/classes')
export class PipelineController {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly storage: StorageService,
    private readonly detect: DetectService,
    private readonly email: EmailService,
  ) {}

  @Get('queue')
  getQueue(@Res() res: Response) {
    const classes = this.storage.getClasses();
    const rows: any[] = [];
    for (const cls of classes) {
      for (const lecture of this.storage.getLectures(cls.id)) {
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
    res.json({ running: this.pipeline.isQueueRunning(), lectures: rows });
  }

  @Post('run-queue')
  runQueue(@Res() res: Response) {
    if (this.pipeline.isQueueRunning()) return res.json({ ok: true, message: 'already running' });
    this.pipeline.runQueue((msg) => console.log('[queue]', msg));
    res.json({ ok: true });
  }

  @Post('run-pipeline')
  runPipeline(@Res() res: Response) {
    if (this.pipeline.isQueueRunning()) return res.json({ ok: true, message: 'already running' });
    this.pipeline.runFullPipeline((msg) => console.log('[pipeline]', msg));
    res.json({ ok: true });
  }

  @Get('cron-log')
  getCronLog(@Res() res: Response) {
    res.json(this.pipeline.getLastCronLog());
  }

  @Post('sync')
  async sync(@Req() req: Request, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const send = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    const classes = this.storage.getClasses().filter((c: any) => c.opalCourseUrl);

    if (!classes.length) {
      send({ type: 'done', results: [], message: 'אין קורסים עם קישור OPAL מוגדר' });
      return res.end();
    }

    const results: any[] = [];
    for (const cls of classes) {
      try {
        send({ type: 'progress', message: `בודק: ${cls.name}...` });
        const newLectures = await this.detect.detectNewLectures(cls.id, (msg: string) => send({ type: 'progress', message: msg }));
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

  @Post('test-email')
  async testEmail(@Body() body: any, @Res() res: Response) {
    const { classId, lectureId } = body;
    if (!classId || !lectureId) return res.status(400).json({ error: 'classId and lectureId required' });
    const cls = this.storage.getClass(classId);
    const lecture = this.storage.getLecture(classId, lectureId);
    if (!cls || !lecture) return res.status(404).json({ error: 'Not found' });
    const summaryContent = this.storage.getCurrentSummaryContent(classId, lectureId);
    if (!summaryContent) return res.status(400).json({ error: 'No summary found for this lecture' });
    try {
      await this.email.sendLectureSummary({ className: cls.name, lectureName: lecture.name, lectureDate: lecture.lectureDate, summaryContent });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
