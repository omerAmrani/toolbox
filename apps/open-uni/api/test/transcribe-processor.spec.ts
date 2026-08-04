import { EventEmitter } from 'events';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { TranscribeProcessor, TranscribeJobData } from '../src/modules/lectures/transcribe.processor';
import { encryptForQueue } from '../src/modules/queue/queue-crypto';

let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(os.tmpdir(), 'transcribe-processor-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('TranscribeProcessor', () => {
  let lecturesService: { activeJobs: Map<string, any> };
  let storage: { getLecture: jest.Mock; lectureDirPath: jest.Mock; updateLectureMeta: jest.Mock };
  let download: { extractVideoUrl: jest.Mock; downloadAndTranscribe: jest.Mock };
  let processor: TranscribeProcessor;
  let bus: EventEmitter;

  const jobData: TranscribeJobData = {
    classId: 'c1',
    lectureId: 'l1',
    userId: 'user-a',
    encryptedCredentials: encryptForQueue({ opalUsername: 'u', opalPassword: 'p', opalId: '1', groqApiKey: 'g' }),
    maxDurationSecs: null,
  };

  beforeEach(() => {
    bus = new EventEmitter();
    lecturesService = {
      activeJobs: new Map([['c1/l1', { bus, controllers: new Map([['transcribe', new AbortController()]]) }]]),
    };
    storage = {
      getLecture: jest.fn().mockReturnValue({ url: 'https://example.com/lecture' }),
      lectureDirPath: jest.fn().mockReturnValue(dir),
      updateLectureMeta: jest.fn(),
    };
    download = {
      extractVideoUrl: jest.fn().mockResolvedValue('https://example.com/video.m3u8'),
      downloadAndTranscribe: jest.fn().mockResolvedValue('Transcript text'),
    };
    processor = new TranscribeProcessor(lecturesService as any, storage as any, download as any);
  });

  it('decrypts credentials, runs the pipeline, and broadcasts done on success', async () => {
    const events: any[] = [];
    bus.on('event', (e) => events.push(e));
    let ended = false;
    bus.on('end', () => { ended = true; });

    await processor.process({ id: 'job-1', data: jobData } as any);

    expect(download.extractVideoUrl).toHaveBeenCalledWith(
      'https://example.com/lecture',
      { username: 'u', password: 'p', id: '1' },
      expect.any(Function),
      expect.anything(),
    );
    expect(download.downloadAndTranscribe).toHaveBeenCalledWith(
      'job-1', 'https://example.com/video.m3u8', 'g', expect.any(Function), null, expect.any(String), null, expect.anything(),
    );
    expect(storage.updateLectureMeta).toHaveBeenCalledWith('c1', 'l1', { status: 'transcribed', whisperBackend: 'groq-whisper' });
    expect(events.find((e) => e.type === 'done')).toMatchObject({ status: 'transcribed' });
    expect(ended).toBe(true);
    expect(lecturesService.activeJobs.has('c1/l1')).toBe(false);
  });

  it('broadcasts error and reverts status to pending when the pipeline throws', async () => {
    download.extractVideoUrl.mockRejectedValueOnce(new Error('Login failed'));
    const events: any[] = [];
    bus.on('event', (e) => events.push(e));

    await processor.process({ data: jobData } as any);

    expect(storage.updateLectureMeta).toHaveBeenCalledWith('c1', 'l1', expect.objectContaining({
      status: 'pending',
      lastError: 'Login failed',
    }));
    expect(events.find((e) => e.type === 'error')).toMatchObject({ message: 'Login failed' });
  });
});
