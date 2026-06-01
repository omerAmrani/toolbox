import { Injectable } from '@nestjs/common';
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import { StorageService } from '../storage/storage.service';
import { DetectService } from '../detect/detect.service';
import { DownloadService } from '../download/download.service';
import { SummarizeService } from '../summarize/summarize.service';
import { EmailService } from '../email/email.service';
import { SUMMARIZE_BACKEND } from '../../config';

const DATA_DIR = path.resolve(__dirname, '..', '..', '..', 'data');
const CRON_LOG_PATH = path.join(DATA_DIR, 'cron-log.json');

interface CronLogEntry {
  timestamp: string;
  trigger?: string;
  found: number;
  queued: number;
  error?: string;
}

@Injectable()
export class PipelineService {
  private queueRunning = false;
  private readonly activeAbortControllers = new Map<string, AbortController>();

  constructor(
    private readonly storage: StorageService,
    private readonly detect: DetectService,
    private readonly download: DownloadService,
    private readonly summarize: SummarizeService,
    private readonly email: EmailService,
  ) {}

  isQueueRunning(): boolean { return this.queueRunning; }

  // ── Cron log ──────────────────────────────────────────────────────────────────

  private readCronLog(): CronLogEntry[] {
    try { return JSON.parse(readFileSync(CRON_LOG_PATH, 'utf8')); } catch { return []; }
  }

  logCronRun(entry: Omit<CronLogEntry, 'timestamp'>): void {
    mkdirSync(DATA_DIR, { recursive: true });
    const log = this.readCronLog();
    log.push({ ...entry, timestamp: new Date().toISOString() });
    if (log.length > 50) log.splice(0, log.length - 50);
    writeFileSync(CRON_LOG_PATH, JSON.stringify(log, null, 2));
  }

  getLastCronLog(): CronLogEntry | null {
    const log = this.readCronLog();
    return log[log.length - 1] ?? null;
  }

  // ── Startup recovery ──────────────────────────────────────────────────────────

  resetStuckProcessing(): void {
    for (const cls of this.storage.getClasses()) {
      for (const lecture of this.storage.getLectures(cls.id)) {
        if (lecture.status === 'processing') {
          this.storage.updateLectureMeta(cls.id, lecture.id, {
            status: 'failed',
            lastError: 'Server restarted mid-job',
            lastErrorAt: new Date().toISOString(),
          });
          console.log(`[pipeline] reset stuck lecture: ${cls.id}/${lecture.id}`);
        }
      }
    }
  }

  // ── Queue runner ──────────────────────────────────────────────────────────────

  async runQueue(onProgress = (_: string) => {}): Promise<void> {
    if (this.queueRunning) {
      onProgress('תור כבר פועל');
      return;
    }
    this.queueRunning = true;

    try {
      const pending: { classId: string; lectureId: string }[] = [];
      for (const cls of this.storage.getClasses()) {
        for (const lecture of this.storage.getLectures(cls.id)) {
          if (lecture.status === 'pending') pending.push({ classId: cls.id, lectureId: lecture.id });
        }
      }

      onProgress(`תור: ${pending.length} הרצאות ממתינות`);

      for (const { classId, lectureId } of pending) {
        const lecture = this.storage.getLecture(classId, lectureId);
        if (!lecture || lecture.status !== 'pending') continue;

        const dir = this.storage.lectureDirPath(classId, lectureId);
        const transcriptPath = path.join(dir, 'transcript.txt');
        const mp3Path = path.join(dir, 'audio.mp3');

        const controller = new AbortController();
        const abortKey = `${classId}/${lectureId}:transcribe`;
        this.activeAbortControllers.set(abortKey, controller);

        try {
          this.storage.updateLectureMeta(classId, lectureId, { status: 'processing', startedAt: new Date().toISOString() });
          onProgress(`מתחיל: ${lecture.name}`);

          if (!existsSync(transcriptPath)) {
            const videoUrl = await this.download.extractVideoUrl(lecture.url, onProgress, controller.signal);
            const transcript = await this.download.downloadAndTranscribe(videoUrl, onProgress, null, mp3Path, null, controller.signal);
            if (!transcript.trim()) throw new Error('תמלול ריק — לא ניתן לסכם');
            writeFileSync(transcriptPath, transcript);
            if (existsSync(mp3Path)) rmSync(mp3Path);
            this.storage.updateLectureMeta(classId, lectureId, { whisperBackend: 'groq-whisper' });
          }

          const transcript = readFileSync(transcriptPath, 'utf8');
          if (!transcript.trim()) throw new Error('תמלול ריק — לא ניתן לסכם');
          const { mergeSummaries } = await this.summarize.getSummarizer();
          const summary = await mergeSummaries([transcript], onProgress, () => {});
          this.storage.saveSummaryVersion(classId, lectureId, summary, SUMMARIZE_BACKEND!);

          this.storage.updateLectureMeta(classId, lectureId, {
            status: 'done',
            summarizedAt: new Date().toISOString(),
            summarizeBackend: SUMMARIZE_BACKEND,
          });
          onProgress(`הושלם: ${lecture.name}`);
          console.log(`[pipeline] done: ${classId}/${lectureId}`);

          const cls = this.storage.getClass(classId);
          this.email.sendLectureSummary({
            className: cls?.name || classId,
            lectureName: lecture.name,
            lectureDate: lecture.lectureDate,
            summaryContent: summary,
          }).catch((err: any) => console.warn('[email] failed to send:', err.message));
        } catch (err: any) {
          const aborted = controller.signal.aborted;
          if (aborted) console.log(`[pipeline] aborted: ${classId}/${lectureId}`);
          else console.error(`[pipeline] failed ${classId}/${lectureId}:`, err.message);
          this.storage.updateLectureMeta(classId, lectureId, {
            status: aborted ? 'aborted' : 'failed',
            lastError: aborted ? null : err.message,
            lastErrorAt: aborted ? null : new Date().toISOString(),
          });
          onProgress(aborted ? `בוטל: ${lecture.name}` : `שגיאה: ${lecture.name} — ${err.message}`);
        } finally {
          this.activeAbortControllers.delete(abortKey);
        }
      }

      onProgress('התור הסתיים');
    } finally {
      this.queueRunning = false;
    }
  }

  // ── Full pipeline (detect + queue) ────────────────────────────────────────────

  async runFullPipeline(onProgress = (_: string) => {}): Promise<{ found: number; queued: number }> {
    if (this.queueRunning) {
      onProgress('פייפליין כבר פועל');
      return { found: 0, queued: 0 };
    }

    const classes = this.storage.getClasses().filter((c: any) => c.opalCourseUrl);
    const foundLectures: any[] = [];

    for (const cls of classes) {
      try {
        onProgress(`בודק הרצאות חדשות: ${cls.name}`);
        const newLectures = await this.detect.detectNewLectures(cls.id, onProgress);
        for (const lec of newLectures) {
          this.storage.createLecture(cls.id, lec);
          foundLectures.push({ className: cls.name, lectureName: lec.name, lectureDate: lec.lectureDate });
        }
      } catch (err: any) {
        console.error(`[pipeline] detect failed for ${cls.id}:`, err.message);
        onProgress(`שגיאה בזיהוי: ${cls.name} — ${err.message}`);
      }
    }

    onProgress(`נמצאו ${foundLectures.length} הרצאות חדשות`);

    if (foundLectures.length > 0) {
      this.email.sendDetectionNotification(foundLectures).catch((err: any) =>
        console.warn('[email] detection notification failed:', err.message)
      );
    }

    return { found: foundLectures.length, queued: foundLectures.length };
  }
}
