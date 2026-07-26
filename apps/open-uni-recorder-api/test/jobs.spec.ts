import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import request from 'supertest';
import { JobsModule } from '../src/modules/jobs/jobs.module';
import { DetectService } from '../src/modules/detect/detect.service';
import { DownloadService } from '../src/modules/download/download.service';
import { SummarizeService } from '../src/modules/summarize/summarize.service';
import { EmailService } from '../src/modules/email/email.service';
import { truncateAll, cleanClassesDir } from './helpers/db';

const mockDetect = { detectNewLectures: jest.fn().mockResolvedValue([]) };
const mockDownload = {};
const mockSummarize = {};
const mockEmail = { sendLectureSummary: jest.fn(), sendDetectionNotification: jest.fn() };

describe('JobsController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ScheduleModule.forRoot(), JobsModule],
    })
      .overrideProvider(DetectService).useValue(mockDetect)
      .overrideProvider(DownloadService).useValue(mockDownload)
      .overrideProvider(SummarizeService).useValue(mockSummarize)
      .overrideProvider(EmailService).useValue(mockEmail)
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    cleanClassesDir();
  });

  beforeEach(() => {
    truncateAll();
    jest.clearAllMocks();
  });

  describe('GET /api/classes/cron-schedule', () => {
    it('returns the default schedule and a computed next run', async () => {
      const res = await request(app.getHttpServer()).get('/api/classes/cron-schedule');
      expect(res.status).toBe(200);
      expect(res.body.schedule).toEqual({ days: [4, 5], hour: 10, minute: 0 });
      expect(res.body.nextRun).toEqual(expect.any(String));
    });
  });

  describe('PUT /api/classes/cron-schedule', () => {
    it('rejects invalid days', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/classes/cron-schedule')
        .send({ days: [7], hour: 10, minute: 0 });
      expect(res.status).toBe(400);
    });

    it('rejects out-of-range hour/minute', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/classes/cron-schedule')
        .send({ days: [1], hour: 24, minute: 0 });
      expect(res.status).toBe(400);
    });

    it('updates the schedule and reflects it in the next run', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/classes/cron-schedule')
        .send({ days: [1], hour: 8, minute: 30 });
      expect(res.status).toBe(200);
      expect(res.body.schedule).toEqual({ days: [1], hour: 8, minute: 30 });

      const getRes = await request(app.getHttpServer()).get('/api/classes/cron-schedule');
      expect(getRes.body.schedule).toEqual({ days: [1], hour: 8, minute: 30 });
    });
  });

  describe('GET /api/classes/notify-email', () => {
    it('returns null when unset', async () => {
      const res = await request(app.getHttpServer()).get('/api/classes/notify-email');
      expect(res.status).toBe(200);
      expect(res.body.email).toBeNull();
    });
  });

  describe('PUT /api/classes/notify-email', () => {
    it('rejects an invalid email', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/classes/notify-email')
        .send({ email: 'not-an-email' });
      expect(res.status).toBe(400);
    });

    it('saves a valid email', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/classes/notify-email')
        .send({ email: 'me@example.com' });
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('me@example.com');

      const getRes = await request(app.getHttpServer()).get('/api/classes/notify-email');
      expect(getRes.body.email).toBe('me@example.com');
    });
  });

  describe('GET /api/classes/active-semester', () => {
    it('returns null when unset', async () => {
      const res = await request(app.getHttpServer()).get('/api/classes/active-semester');
      expect(res.status).toBe(200);
      expect(res.body.activeSemester).toBeNull();
    });
  });

  describe('PUT /api/classes/active-semester', () => {
    it('rejects a missing semester or non-integer year', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/classes/active-semester')
        .send({ semester: 'א', year: '2025' });
      expect(res.status).toBe(400);
    });

    it('saves a valid semester + year', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/classes/active-semester')
        .send({ semester: 'א', year: 2025 });
      expect(res.status).toBe(200);
      expect(res.body.activeSemester).toEqual({ semester: 'א', year: 2025 });

      const getRes = await request(app.getHttpServer()).get('/api/classes/active-semester');
      expect(getRes.body.activeSemester).toEqual({ semester: 'א', year: 2025 });
    });
  });
});
