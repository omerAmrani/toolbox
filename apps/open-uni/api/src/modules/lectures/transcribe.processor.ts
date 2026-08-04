import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { existsSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import { TRANSCRIBE_QUEUE } from '../queue/queue.constants';
import { decryptFromQueue } from '../queue/queue-crypto';
import { LecturesService } from './lectures.service';
import { StorageService } from '../storage/storage.service';
import { DownloadService } from '../download/download.service';
import { releaseJobSlot } from '../../job-guard';
import { OpalCredentials } from '../../credentials';

export interface TranscribeJobData {
  classId: string;
  lectureId: string;
  userId: string;
  encryptedCredentials: string; // decrypts to TranscribeCredentials
  maxDurationSecs: number | null;
}

interface TranscribeCredentials {
  opalUsername: string;
  opalPassword: string;
  opalId: string;
  groqApiKey: string;
}

// Runs in-process for now (monolith, see multi-user.md §2) — moves to a
// standalone worker later by pointing this at the same Redis, no redesign.
@Processor(TRANSCRIBE_QUEUE, { concurrency: 3 })
export class TranscribeProcessor extends WorkerHost {
  constructor(
    private readonly lecturesService: LecturesService,
    private readonly storage: StorageService,
    private readonly download: DownloadService,
  ) {
    super();
  }

  async process(job: Job<TranscribeJobData>): Promise<void> {
    const { classId, lectureId, userId, encryptedCredentials, maxDurationSecs } = job.data;
    const key = `${classId}/${lectureId}`;
    const activeJob = this.lecturesService.activeJobs.get(key);
    const bus = activeJob?.bus;
    const broadcast = (data: any) => { try { bus?.emit('event', data); } catch (_) {} };
    const controller = activeJob?.controllers.get('transcribe') ?? new AbortController();

    const creds = decryptFromQueue<TranscribeCredentials>(encryptedCredentials);
    const opalCredentials: OpalCredentials = { username: creds.opalUsername, password: creds.opalPassword, id: creds.opalId };

    const lecture = this.storage.getLecture(classId, lectureId);
    const dir = this.storage.lectureDirPath(classId, lectureId);
    const transcriptPath = path.join(dir, 'transcript.txt');
    const mp3Path = path.join(dir, 'audio.mp3');

    try {
      broadcast({ type: 'progress', step: 'login', message: 'מתחבר לאוניברסיטה הפתוחה...' });
      const videoUrl = await this.download.extractVideoUrl(
        lecture!.url,
        opalCredentials,
        (msg: string) => broadcast({ type: 'progress', step: 'login', message: msg }),
        controller.signal,
      );

      broadcast({ type: 'progress', step: 'download', message: 'מוריד ומתמלל...' });
      const transcript = await this.download.downloadAndTranscribe(
        String(job.id),
        videoUrl,
        creds.groqApiKey,
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
