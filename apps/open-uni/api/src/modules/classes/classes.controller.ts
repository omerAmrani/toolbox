import { Controller, Get, Post, Patch, Delete, Param, Body, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { StorageService } from '../storage/storage.service';
import { DetectService } from '../detect/detect.service';
import { OpalCredentials } from '../../credentials';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { tryAcquireJobSlot, releaseJobSlot } from '../../job-guard';

function opalCredentialsFromBody(body: any): OpalCredentials | null {
  const { opalUsername, opalPassword, opalId } = body || {};
  if (!opalUsername || !opalPassword || !opalId) return null;
  return { username: opalUsername, password: opalPassword, id: opalId };
}

@Controller('api/classes')
@UseGuards(JwtAuthGuard)
export class ClassesController {
  constructor(
    private readonly storage: StorageService,
    private readonly detect: DetectService,
  ) {}

  @Get()
  listClasses(@CurrentUser() userId: string, @Res() res: Response) {
    const classes = this.storage.getClasses(userId);
    res.json(classes.map((c: any) => ({ ...c, lectureCount: this.storage.getLectures(c.id).length })));
  }

  @Post('opal-metadata')
  async extractOpalMetadata(@Body() body: any, @Res() res: Response) {
    const { opalCourseUrl } = body;
    if (!opalCourseUrl) return res.status(400).json({ error: 'opalCourseUrl required' });
    const credentials = opalCredentialsFromBody(body);
    if (!credentials) return res.status(400).json({ error: 'OPAL credentials required' });
    try {
      res.json(await this.detect.extractCourseMeta(opalCourseUrl, credentials));
    } catch (e: any) {
      res.status(502).json({ error: e?.message || 'שגיאה בקריאת פרטי הקורס מ-OPAL' });
    }
  }

  // Manual "check for new lectures" trigger — replaces the old unattended
  // cron, which can't work with per-user client-side-only credentials.
  @Post(':classId/detect')
  async detectNewLectures(@CurrentUser() userId: string, @Param('classId') classId: string, @Body() body: any, @Res() res: Response) {
    if (!this.storage.getClassForUser(classId, userId)) return res.status(404).json({ error: 'Not found' });
    const credentials = opalCredentialsFromBody(body);
    if (!credentials) return res.status(400).json({ error: 'OPAL credentials required' });
    if (!tryAcquireJobSlot(userId)) {
      return res.status(429).json({ error: 'כבר יש עבודה פעילה אחת בתהליך. המתן לסיומה.' });
    }
    try {
      const found = await this.detect.detectNewLectures(classId, credentials);
      const added = found.map((lec: any) => this.storage.createLecture(classId, lec));
      res.json({ newLectures: added });
    } catch (e: any) {
      res.status(502).json({ error: e?.message || 'שגיאה בבדיקת הרצאות חדשות' });
    } finally {
      releaseJobSlot(userId);
    }
  }

  @Post()
  createClass(@CurrentUser() userId: string, @Body() body: any, @Res() res: Response) {
    const { name, semester, year, code, opalCourseUrl } = body;
    if (!name) return res.status(400).json({ error: 'name required' });
    res.status(201).json(this.storage.createClass({ name, semester, year, code, opalCourseUrl }, userId));
  }

  @Patch(':classId')
  updateClass(@CurrentUser() userId: string, @Param('classId') classId: string, @Body() body: any, @Res() res: Response) {
    if (!this.storage.getClassForUser(classId, userId)) return res.status(404).json({ error: 'Not found' });
    const { name, opalCourseUrl, code, semester, year } = body;
    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (opalCourseUrl !== undefined) updates.opalCourseUrl = opalCourseUrl;
    if (code !== undefined) updates.code = code;
    if (semester !== undefined) updates.semester = semester;
    if (year !== undefined) updates.year = year;
    res.json(this.storage.updateClassMeta(classId, updates));
  }

  @Delete(':classId')
  deleteClass(@CurrentUser() userId: string, @Param('classId') classId: string, @Res() res: Response) {
    if (!this.storage.getClassForUser(classId, userId)) return res.status(404).json({ error: 'Not found' });
    this.storage.deleteClass(classId);
    res.json({ ok: true });
  }
}
