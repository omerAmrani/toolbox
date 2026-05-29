import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ClassesModule } from '../src/modules/classes/classes.module';
import { truncateAll } from './helpers/db';

describe('ClassesController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ClassesModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    truncateAll();
  });

  describe('GET /api/classes', () => {
    it('returns empty array when no classes exist', async () => {
      const res = await request(app.getHttpServer()).get('/api/classes');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns classes with lectureCount', async () => {
      await request(app.getHttpServer())
        .post('/api/classes')
        .send({ name: 'Math 101', semester: 'A', year: 2025 });

      const res = await request(app.getHttpServer()).get('/api/classes');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ name: 'Math 101', semester: 'A', year: 2025, lectureCount: 0 });
    });
  });

  describe('POST /api/classes', () => {
    it('returns 400 when name is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/classes')
        .send({ semester: 'A' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('creates a class and returns 201 with the class', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/classes')
        .send({ name: 'Physics', semester: 'B', year: 2025 });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'Physics', semester: 'B', year: 2025 });
      expect(res.body.id).toBeDefined();
    });

    it('creates a class with only a name', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/classes')
        .send({ name: 'History' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('History');
    });
  });

  describe('PATCH /api/classes/:classId', () => {
    it('returns 404 for unknown classId', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/classes/nonexistent')
        .send({ opalCourseUrl: 'https://example.com' });
      expect(res.status).toBe(404);
    });

    it('updates opalCourseUrl', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/classes')
        .send({ name: 'Bio' });

      const res = await request(app.getHttpServer())
        .patch(`/api/classes/${created.body.id}`)
        .send({ opalCourseUrl: 'https://opal.example.com/course/123' });
      expect(res.status).toBe(200);
      expect(res.body.opalCourseUrl).toBe('https://opal.example.com/course/123');
    });
  });

  describe('DELETE /api/classes/:classId', () => {
    it('returns 404 for unknown classId', async () => {
      const res = await request(app.getHttpServer()).delete('/api/classes/nonexistent');
      expect(res.status).toBe(404);
    });

    it('deletes the class and returns ok', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/classes')
        .send({ name: 'Temp' });

      const del = await request(app.getHttpServer()).delete(`/api/classes/${created.body.id}`);
      expect(del.status).toBe(200);
      expect(del.body.ok).toBe(true);

      const list = await request(app.getHttpServer()).get('/api/classes');
      expect(list.body).toHaveLength(0);
    });

    it('cascades — class disappears from list after delete', async () => {
      const c1 = await request(app.getHttpServer()).post('/api/classes').send({ name: 'Keep' });
      const c2 = await request(app.getHttpServer()).post('/api/classes').send({ name: 'Delete' });

      await request(app.getHttpServer()).delete(`/api/classes/${c2.body.id}`);

      const list = await request(app.getHttpServer()).get('/api/classes');
      expect(list.body).toHaveLength(1);
      expect(list.body[0].name).toBe('Keep');
    });
  });
});
