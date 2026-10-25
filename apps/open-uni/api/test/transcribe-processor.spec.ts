import { EventEmitter } from 'events';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { TranscribeProcessor, TranscribeJobData } from '../src/modules/lectures/transcribe.processor';

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
    opalCredentials: { username: 'u', password: 'p', id: '1' },
    groqApiKey: 'g',
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

  it('runs the pipeline with the given credentials, and broadcasts done on success', async () => {
    const events: any[] = [];
    bus.on('event', (e) => events.push(e));
    let ended = false;
    bus.on('end', () => { ended = true; });

    await processor.run(jobData);

    expect(download.extractVideoUrl).toHaveBeenCalledWith(
      'https://example.com/lecture',
      { username: 'u', password: 'p', id: '1' },
      expect.any(Function),
      expect.anything(),
    );
    expect(download.downloadAndTranscribe).toHaveBeenCalledWith(
      expect.any(String), 'https://example.com/video.m3u8', 'g', expect.any(Function), null, expect.any(String), null, expect.anything(),
    );
    expect(storage.updateLectureMeta).toHaveBeenCalledWith('c1', 'l1', { status: 'transcribed', whisperBackend: 'groq-whisper' });
    expect(events.find((e) => e.type === 'done')).toMatchObject({ status: 'transcribed' });
    expect(ended).toBe(true);
    expect(lecturesService.activeJobs.has('c1/l1')).toBe(false);
  });

  it('forwards download percentage on progress events', async () => {
    download.downloadAndTranscribe.mockImplementationOnce(async (_id, _url, _key, onProgress) => {
      onProgress('מוריד: 34% (40:00 / 1:40:00)', 34);
      return 'Transcript text';
    });
    const events: any[] = [];
    bus.on('event', (e) => events.push(e));

    await processor.run(jobData);

    expect(events).toContainEqual(expect.objectContaining({ type: 'progress', step: 'transcribe', pct: 34 }));
  });

  it('broadcasts error and reverts status to pending when the pipeline throws', async () => {
    download.extractVideoUrl.mockRejectedValueOnce(new Error('Login failed'));
    const events: any[] = [];
    bus.on('event', (e) => events.push(e));

    await processor.run(jobData);

    expect(storage.updateLectureMeta).toHaveBeenCalledWith('c1', 'l1', expect.objectContaining({
      status: 'pending',
      lastError: 'Login failed',
    }));
    expect(events.find((e) => e.type === 'error')).toMatchObject({ message: 'Login failed' });
  });
});
