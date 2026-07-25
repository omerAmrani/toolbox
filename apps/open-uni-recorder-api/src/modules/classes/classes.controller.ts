import { Controller, Get, Post, Patch, Delete, Param, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import { StorageService } from '../storage/storage.service';
import { DetectService } from '../detect/detect.service';

@Controller('api/classes')
export class ClassesController {
  constructor(
    private readonly storage: StorageService,
    private readonly detect: DetectService,
  ) {}

  @Get()
  listClasses(@Res() res: Response) {
    const classes = this.storage.getClasses();
    res.json(classes.map((c: any) => ({ ...c, lectureCount: this.storage.getLectures(c.id).length })));
  }

  @Post('opal-metadata')
  async extractOpalMetadata(@Body() body: any, @Res() res: Response) {
    const { opalCourseUrl } = body;
    if (!opalCourseUrl) return res.status(400).json({ error: 'opalCourseUrl required' });
    try {
      res.json(await this.detect.extractCourseMeta(opalCourseUrl));
    } catch (e: any) {
      res.status(502).json({ error: e?.message || 'שגיאה בקריאת פרטי הקורס מ-OPAL' });
    }
  }

  @Post()
  createClass(@Body() body: any, @Res() res: Response) {
    const { name, semester, year, code, opalCourseUrl } = body;
    if (!name) return res.status(400).json({ error: 'name required' });
    res.status(201).json(this.storage.createClass({ name, semester, year, code, opalCourseUrl }));
  }

  @Patch(':classId')
  updateClass(@Param('classId') classId: string, @Body() body: any, @Res() res: Response) {
    if (!this.storage.getClass(classId)) return res.status(404).json({ error: 'Not found' });
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
  deleteClass(@Param('classId') classId: string, @Res() res: Response) {
    if (!this.storage.deleteClass(classId)) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  }
}
