import { Controller, Get, Put, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import { JobsService } from './jobs.service';
import { StorageService } from '../storage/storage.service';

@Controller('api/classes')
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly storage: StorageService,
  ) {}

  @Get('cron-schedule')
  getCronSchedule(@Res() res: Response) {
    res.json(this.jobs.getSchedule());
  }

  @Put('cron-schedule')
  updateCronSchedule(@Body() body: any, @Res() res: Response) {
    const { days, hour, minute } = body;
    if (!Array.isArray(days) || !days.length || days.some((d: any) => !Number.isInteger(d) || d < 0 || d > 6)) {
      return res.status(400).json({ error: 'days must be a non-empty array of integers 0-6' });
    }
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return res.status(400).json({ error: 'hour must be 0-23' });
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) return res.status(400).json({ error: 'minute must be 0-59' });
    this.jobs.updateSchedule({ days, hour, minute });
    res.json(this.jobs.getSchedule());
  }

  @Get('notify-email')
  getNotifyEmail(@Res() res: Response) {
    res.json({ email: this.storage.getNotifyEmail() });
  }

  @Put('notify-email')
  updateNotifyEmail(@Body() body: any, @Res() res: Response) {
    const { email } = body;
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'valid email required' });
    }
    this.storage.setNotifyEmail(email);
    res.json({ email });
  }

  @Get('active-semester')
  getActiveSemester(@Res() res: Response) {
    res.json({ activeSemester: this.storage.getActiveSemester() });
  }

  @Put('active-semester')
  updateActiveSemester(@Body() body: any, @Res() res: Response) {
    const { semester, year } = body;
    if (typeof semester !== 'string' || !semester || !Number.isInteger(year)) {
      return res.status(400).json({ error: 'semester (string) and year (integer) required' });
    }
    this.storage.setActiveSemester({ semester, year });
    res.json({ activeSemester: { semester, year } });
  }
}
