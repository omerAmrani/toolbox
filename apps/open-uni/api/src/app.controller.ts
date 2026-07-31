import { Controller, Get, Post, Res, Req } from '@nestjs/common';
import { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import path from 'path';
import { StorageService } from './modules/storage/storage.service';
import { getSettings, saveSettings } from '../settings';
import { DATA_DIR } from './db';

const execAsync = promisify(exec);

@Controller('api')
export class AppController {
  constructor(private readonly storage: StorageService) {}

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
