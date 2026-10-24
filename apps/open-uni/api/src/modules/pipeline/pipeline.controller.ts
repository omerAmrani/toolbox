import { Controller, Get, Post, Body, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { StorageService } from '../storage/storage.service';
import { DetectService } from '../detect/detect.service';
import { getOpalCredentials, MISSING_CREDENTIALS } from '../../credentials';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { tryAcquireJobSlot, releaseJobSlot } from '../../job-guard';

@Controller('api/classes')
@UseGuards(JwtAuthGuard)
export class PipelineController {
  constructor(
    private readonly storage: StorageService,
    private readonly detect: DetectService,
  ) {}

  @Get('queue')
  getQueue(@CurrentUser() userId: string, @Query() query: { semester?: string; year?: string }, @Res() res: Response) {
    const { semester } = query;
    const year = query.year ? Number(query.year) : undefined;
    const classes = this.storage.getClasses(userId).filter((c: any) =>
      !semester || !year || (c.semester === semester && c.year === year),
    );
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
    res.json({ lectures: rows });
  }

  // Bulk "check for new lectures" across every one of the caller's classes —
  // manual, OPAL credentials from the API's .env (see docs/pipeline.md).
  @Post('sync')
  async sync(@CurrentUser() userId: string, @Req() req: Request, @Res() res: Response) {
    const { semester, year } = req.body as { semester?: string; year?: number };
    const credentials = getOpalCredentials();
    if (!credentials) return res.status(400).json({ error: MISSING_CREDENTIALS.opal });

    if (!tryAcquireJobSlot(userId)) {
      return res.status(429).json({ error: 'כבר יש עבודה פעילה אחת בתהליך. המתן לסיומה.' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const send = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      const classes = this.storage.getClasses(userId).filter((c: any) =>
        c.opalCourseUrl && (!semester || !year || (c.semester === semester && c.year === year)),
      );

      if (!classes.length) {
        send({ type: 'done', results: [], message: 'אין קורסים עם קישור OPAL מוגדר' });
        return res.end();
      }

      const results: any[] = [];
      for (const cls of classes) {
        try {
          send({ type: 'progress', message: `בודק: ${cls.name}...` });
          const newLectures = await this.detect.detectNewLectures(cls.id, credentials, (msg: string) => send({ type: 'progress', message: msg }));
          const added = newLectures.map((lec: any) => this.storage.createLecture(cls.id, lec));
          results.push({ classId: cls.id, className: cls.name, newLectures: added });
          send({ type: 'class', classId: cls.id, className: cls.name, newLectures: added });
        } catch (err: any) {
          results.push({ classId: cls.id, className: cls.name, error: err.message });
          send({ type: 'class', classId: cls.id, className: cls.name, error: err.message, newLectures: [] });
        }
      }

      send({ type: 'done', results });
      res.end();
    } finally {
      releaseJobSlot(userId);
    }
  }
}
