import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PipelineModule } from '../src/modules/pipeline/pipeline.module';
import { ClassesModule } from '../src/modules/classes/classes.module';
import { DetectService } from '../src/modules/detect/detect.service';
import { DownloadService } from '../src/modules/download/download.service';
import { SummarizeService } from '../src/modules/summarize/summarize.service';
import { EmailService } from '../src/modules/email/email.service';
import { StorageService } from '../src/modules/storage/storage.service';
import { truncateAll, cleanClassesDir } from './helpers/db';

const mockDetect = {
  detectNewLectures: jest.fn().mockResolvedValue([]),
};

const mockDownload = {
  extractVideoUrl: jest.fn().mockResolvedValue('https://example.com/video.mp4'),
  downloadAndTranscribe: jest.fn().mockResolvedValue('Mock transcript'),
};

const mockSummarize = {
  getSummarizer: jest.fn().mockResolvedValue({
    mergeSummaries: jest.fn().mockResolvedValue('Mock summary'),
  }),
  withAbort: jest.fn().mockImplementation((p: Promise<any>) => p),
};

const mockEmail = {
  sendLectureSummary: jest.fn().mockResolvedValue(undefined),
  sendDetectionNotification: jest.fn().mockResolvedValue(undefined),
};

function parseSSE(raw: string): any[] {
  return raw
    .split('\n\n')
    .filter(chunk => chunk.startsWith('data: '))
    .map(chunk => JSON.parse(chunk.slice(6)));
}

describe('PipelineController', () => {
  let app: INestApplication;
  let storage: StorageService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ClassesModule, PipelineModule],
    })
      .overrideProvider(DetectService).useValue(mockDetect)
      .overrideProvider(DownloadService).useValue(mockDownload)
      .overrideProvider(SummarizeService).useValue(mockSummarize)
      .overrideProvider(EmailService).useValue(mockEmail)
      .compile();

    app = module.createNestApplication();
    await app.init();
    storage = module.get<StorageService>(StorageService);
  });

  afterAll(async () => {
    await app.close();
    cleanClassesDir();
  });

  beforeEach(() => {
    truncateAll();
    jest.clearAllMocks();
  });

  describe('GET /api/classes/queue', () => {
    it('returns queue status with running=false and empty lectures when no data', async () => {
      const res = await request(app.getHttpServer()).get('/api/classes/queue');
      expect(res.status).toBe(200);
      expect(res.body.running).toBe(false);
      expect(res.body.lectures).toEqual([]);
    });

    it('includes all lectures across all classes', async () => {
      const cls = storage.createClass({ name: 'Math', semester: 'A', year: 2025 });
      storage.createLecture(cls.id, { name: 'L1', url: 'https://example.com', status: 'pending' });
      storage.createLecture(cls.id, { name: 'L2', url: 'https://example.com', status: 'failed' });

      const res = await request(app.getHttpServer()).get('/api/classes/queue');
      expect(res.status).toBe(200);
      expect(res.body.lectures).toHaveLength(2);
      expect(res.body.lectures[0]).toMatchObject({ className: 'Math', status: 'pending' });
    });
  });

  describe('POST /api/classes/run-queue', () => {
    it('returns ok when queue is not already running', async () => {
      const res = await request(app.getHttpServer()).post('/api/classes/run-queue');
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('POST /api/classes/run-pipeline', () => {
    it('returns ok when pipeline is not running', async () => {
      const res = await request(app.getHttpServer()).post('/api/classes/run-pipeline');
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('GET /api/classes/cron-log', () => {
    it('returns null when no cron has run', async () => {
      const res = await request(app.getHttpServer()).get('/api/classes/cron-log');
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });
  });

  describe('POST /api/classes/sync (SSE)', () => {
    it('sends done event immediately when no classes have opalCourseUrl', async () => {
      storage.createClass({ name: 'No URL Class', semester: 'A', year: 2025 });

      const res = await request(app.getHttpServer())
        .post('/api/classes/sync')
        .buffer(true)
        .parse((response, callback) => {
          let data = '';
          response.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          response.on('end', () => callback(null, data));
        });

      const events = parseSSE(typeof res.body === 'string' ? res.body : res.text);
      const done = events.find((e: any) => e.type === 'done');
      expect(done).toBeDefined();
      expect(mockDetect.detectNewLectures).not.toHaveBeenCalled();
    });

    it('calls detectNewLectures for classes with opalCourseUrl and emits class events', async () => {
      const cls = storage.createClass({ name: 'OPAL Class', semester: 'A', year: 2025 });
      storage.updateClassMeta(cls.id, { opalCourseUrl: 'https://opal.example.com/course/1' });

      const res = await request(app.getHttpServer())
        .post('/api/classes/sync')
        .buffer(true)
        .parse((response, callback) => {
          let data = '';
          response.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          response.on('end', () => callback(null, data));
        });

      const events = parseSSE(typeof res.body === 'string' ? res.body : res.text);
      const classEvent = events.find((e: any) => e.type === 'class');
      const done = events.find((e: any) => e.type === 'done');

      expect(mockDetect.detectNewLectures).toHaveBeenCalledWith(cls.id, expect.any(Function));
      expect(classEvent).toMatchObject({ type: 'class', classId: cls.id, newLectures: [] });
      expect(done).toBeDefined();
    });

    it('emits class event with error when detectNewLectures throws', async () => {
      const cls = storage.createClass({ name: 'Error Class', semester: 'A', year: 2025 });
      storage.updateClassMeta(cls.id, { opalCourseUrl: 'https://opal.example.com/course/2' });
      mockDetect.detectNewLectures.mockRejectedValueOnce(new Error('Network error'));

      const res = await request(app.getHttpServer())
        .post('/api/classes/sync')
        .buffer(true)
        .parse((response, callback) => {
          let data = '';
          response.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          response.on('end', () => callback(null, data));
        });

      const events = parseSSE(typeof res.body === 'string' ? res.body : res.text);
      const classEvent = events.find((e: any) => e.type === 'class');
      expect(classEvent.error).toBe('Network error');
      expect(classEvent.newLectures).toEqual([]);
    });
  });

  describe('POST /api/classes/test-email', () => {
    it('returns 400 when classId or lectureId is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/classes/test-email')
        .send({ classId: 'only-class' });
      expect(res.status).toBe(400);
    });

    it('returns 404 when class or lecture does not exist', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/classes/test-email')
        .send({ classId: 'bad-class', lectureId: 'bad-lecture' });
      expect(res.status).toBe(404);
    });

    it('returns 400 when lecture has no summary', async () => {
      const cls = storage.createClass({ name: 'C', semester: 'A', year: 2025 });
      const lec = storage.createLecture(cls.id, { name: 'L', url: 'https://example.com', status: 'pending' });

      const res = await request(app.getHttpServer())
        .post('/api/classes/test-email')
        .send({ classId: cls.id, lectureId: lec.id });
      expect(res.status).toBe(400);
    });

    it('sends email and returns ok when lecture has a summary', async () => {
      const cls = storage.createClass({ name: 'C', semester: 'A', year: 2025 });
      const lec = storage.createLecture(cls.id, { name: 'L', url: 'https://example.com', status: 'pending' });
      storage.saveSummaryVersion(cls.id, lec.id, 'My summary content', 'gemini');

      const res = await request(app.getHttpServer())
        .post('/api/classes/test-email')
        .send({ classId: cls.id, lectureId: lec.id });
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(mockEmail.sendLectureSummary).toHaveBeenCalledWith(
        expect.objectContaining({ summaryContent: 'My summary content' }),
      );
    });
  });
});
