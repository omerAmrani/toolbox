import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JobsModule } from '../src/modules/jobs/jobs.module';
import { truncateAll, cleanClassesDir } from './helpers/db';

describe('JobsController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [JobsModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    cleanClassesDir();
  });

  beforeEach(() => {
    truncateAll();
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
