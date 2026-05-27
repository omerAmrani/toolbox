import { Controller, Get, Post, Patch, Delete, Param, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import { StorageService } from '../storage/storage.service';

@Controller('api/classes')
export class ClassesController {
  constructor(private readonly storage: StorageService) {}

  @Get()
  listClasses(@Res() res: Response) {
    const classes = this.storage.getClasses();
    res.json(classes.map((c: any) => ({ ...c, lectureCount: this.storage.getLectures(c.id).length })));
  }

  @Post()
  createClass(@Body() body: any, @Res() res: Response) {
    const { name, semester, year } = body;
    if (!name) return res.status(400).json({ error: 'name required' });
    res.status(201).json(this.storage.createClass({ name, semester, year }));
  }

  @Patch(':classId')
  updateClass(@Param('classId') classId: string, @Body() body: any, @Res() res: Response) {
    if (!this.storage.getClass(classId)) return res.status(404).json({ error: 'Not found' });
    const { opalCourseUrl } = body;
    const updates: Record<string, any> = {};
    if (opalCourseUrl !== undefined) updates.opalCourseUrl = opalCourseUrl;
    res.json(this.storage.updateClassMeta(classId, updates));
  }

  @Delete(':classId')
  deleteClass(@Param('classId') classId: string, @Res() res: Response) {
    if (!this.storage.deleteClass(classId)) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  }
}
