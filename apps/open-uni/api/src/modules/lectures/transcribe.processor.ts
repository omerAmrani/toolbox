import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import { LecturesService } from './lectures.service';
import { StorageService } from '../storage/storage.service';
import { DownloadService } from '../download/download.service';
import { releaseJobSlot } from '../../job-guard';
import { OpalCredentials } from '../../credentials';

export interface TranscribeJobData {
  classId: string;
  lectureId: string;
  userId: string;
  opalCredentials: OpalCredentials;
  groqApiKey: string;
  maxDurationSecs: number | null;
}

// Runs in-process, started fire-and-forget by the controller. A job in flight
// when the process stops is lost; resetStuckProcessing() reverts its status
// on the next boot (see docs/adr/0001).
// ponytail: no global concurrency cap, only the per-user job slot — add a
// semaphore (or bring back a queue) if several users share one server.
@Injectable()
export class TranscribeProcessor {
  constructor(
    private readonly lecturesService: LecturesService,
    private readonly storage: StorageService,
    private readonly download: DownloadService,
  ) {}

  async run(data: TranscribeJobData): Promise<void> {
    const { classId, lectureId, userId, opalCredentials, groqApiKey, maxDurationSecs } = data;
    const key = `${classId}/${lectureId}`;
    const activeJob = this.lecturesService.activeJobs.get(key);
    const bus = activeJob?.bus;
    const broadcast = (data: any) => { try { bus?.emit('event', data); } catch (_) {} };
    const controller = activeJob?.controllers.get('transcribe') ?? new AbortController();

    try {
      const lecture = this.storage.getLecture(classId, lectureId);
      const dir = this.storage.lectureDirPath(classId, lectureId);
      const transcriptPath = path.join(dir, 'transcript.txt');
      const mp3Path = path.join(dir, 'audio.mp3');

      broadcast({ type: 'progress', step: 'login', message: 'מתחבר לאוניברסיטה הפתוחה...' });
      const videoUrl = await this.download.extractVideoUrl(
        lecture!.url,
        opalCredentials,
        (msg: string) => broadcast({ type: 'progress', step: 'login', message: msg }),
        controller.signal,
      );

      broadcast({ type: 'progress', step: 'download', message: 'מוריד ומתמלל...' });
      const transcript = await this.download.downloadAndTranscribe(
        randomUUID(),
        videoUrl,
        groqApiKey,
        (msg: string) => broadcast({ type: 'progress', step: 'transcribe', message: msg }),
        null,
        mp3Path,
        maxDurationSecs,
        controller.signal,
      );

      writeFileSync(transcriptPath, transcript);
      if (existsSync(mp3Path)) {
        unlinkSync(mp3Path);
        console.log('[transcribe.processor] deleted audio.mp3 after transcript saved');
      }

      this.storage.updateLectureMeta(classId, lectureId, { status: 'transcribed', whisperBackend: 'groq-whisper' });
      broadcast({ type: 'done', status: 'transcribed' });
    } catch (err: any) {
      const aborted = controller.signal.aborted;
      if (aborted) console.log(`[transcribe.processor] aborted: ${key}`);
      else console.error(`[transcribe.processor] error: ${key}`, err.message);
      this.storage.updateLectureMeta(classId, lectureId, {
        status: 'pending',
        lastError: aborted ? 'בוטל על ידי המשתמש' : err.message,
        lastErrorAt: new Date().toISOString(),
      });
      broadcast({ type: aborted ? 'aborted' : 'error', message: err.message });
    } finally {
      this.lecturesService.activeJobs.delete(key);
      releaseJobSlot(userId);
      bus?.emit('end');
    }
  }
}
