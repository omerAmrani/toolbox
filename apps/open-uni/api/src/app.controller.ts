import { Controller, Get, Post, Res, Req, Query } from '@nestjs/common';
import { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import { StorageService } from './modules/storage/storage.service';
import { getSettings, saveSettings } from '../settings';
import { DATA_DIR } from './db';

const execAsync = promisify(exec);

@Controller('api')
export class AppController {
  constructor(private readonly storage: StorageService) {}

  @Get('search')
  search(@Query('q') q: string, @Query('classId') classId: string, @Res() res: Response) {
    if (!q || q.trim().length < 2) return res.status(400).json({ error: 'q must be at least 2 chars' });
    const query = q.trim();
    const results: any[] = [];
    const classIds = classId
      ? [classId]
      : (existsSync(this.storage.CLASSES_DIR)
          ? readdirSync(this.storage.CLASSES_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
          : []);

    for (const cId of classIds) {
      for (const lecture of this.storage.getLectures(cId)) {
        const tPath = path.join(this.storage.CLASSES_DIR, cId, 'lectures', lecture.id, 'transcript.txt');
        if (!existsSync(tPath)) continue;
        const text = readFileSync(tPath, 'utf8');
        const idx = text.toLowerCase().indexOf(query.toLowerCase());
        if (idx === -1) continue;
        const snippet = text.slice(Math.max(0, idx - 100), idx + 200);
        results.push({ classId: cId, lectureId: lecture.id, lectureName: lecture.name, snippet });
      }
    }
    res.json(results);
  }

  @Get('data-dir')
  getDataDir(@Res() res: Response) {
    const configured = getSettings().dataDir || null;
    const hasDb = existsSync(path.join(DATA_DIR, 'recorder.db'));
    res.json({ current: DATA_DIR, configured, hasDb });
  }

  @Post('data-dir/pick')
  async pickDataDir(@Res() res: Response) {
    try {
      const { stdout } = await execAsync(
        `osascript -e 'POSIX path of (choose folder with prompt "בחר תיקייה לנתוני האפליקציה")'`
      );
      const chosen = stdout.trim().replace(/\/$/, '');
      const hasDb = existsSync(path.join(chosen, 'recorder.db'));
      res.json({ path: chosen, hasDb });
    } catch (err: any) {
      if (err.stderr?.includes('User canceled') || err.message.includes('User canceled')) {
        return res.json({ cancelled: true });
      }
      res.status(500).json({ error: err.message });
    }
  }

  @Post('data-dir')
  setDataDir(@Req() req: Request, @Res() res: Response) {
    const { dataDir } = req.body;
    if (!dataDir || typeof dataDir !== 'string') return res.status(400).json({ error: 'dataDir required' });
    const settings = getSettings();
    settings.dataDir = dataDir;
    saveSettings(settings);
    res.json({ ok: true });
    setTimeout(() => process.exit(0), 200);
  }

  @Post('reload-from-disk')
  reloadFromDisk(@Res() res: Response) {
    try {
      const result = this.storage.reloadFromDisk();
      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  }
}
