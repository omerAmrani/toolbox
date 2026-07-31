import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ClassesModule } from '../src/modules/classes/classes.module';
import { DetectService } from '../src/modules/detect/detect.service';
import { truncateAll } from './helpers/db';
import { authCookie } from './helpers/auth';

const USER_A = 'user-a';
const USER_B = 'user-b';
const OPAL_CREDS = { opalUsername: 'u', opalPassword: 'p', opalId: 'id' };

describe('ClassesController', () => {
  let app: INestApplication;
  const detectNewLectures = jest.fn();

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ClassesModule],
    })
      .overrideProvider(DetectService)
      .useValue({ detectNewLectures })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    truncateAll();
    detectNewLectures.mockReset();
  });

  const get = (path: string, user: string | null = USER_A) => {
    const req = request(app.getHttpServer()).get(path);
    return user ? req.set('Cookie', authCookie(user)) : req;
  };
  const post = (path: string, user: string | null = USER_A) => {
    const req = request(app.getHttpServer()).post(path);
    return user ? req.set('Cookie', authCookie(user)) : req;
  };
  const patch = (path: string, user: string | null = USER_A) => {
    const req = request(app.getHttpServer()).patch(path);
    return user ? req.set('Cookie', authCookie(user)) : req;
  };
  const del = (path: string, user: string | null = USER_A) => {
    const req = request(app.getHttpServer()).delete(path);
    return user ? req.set('Cookie', authCookie(user)) : req;
  };

  describe('auth', () => {
    it('returns 401 when not logged in', async () => {
      const res = await get('/api/classes', null);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/classes', () => {
    it('returns empty array when no classes exist', async () => {
      const res = await get('/api/classes');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns classes with lectureCount', async () => {
      await post('/api/classes').send({ name: 'Math 101', semester: 'A', year: 2025 });

      const res = await get('/api/classes');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ name: 'Math 101', semester: 'A', year: 2025, lectureCount: 0 });
    });

    it('only returns classes owned by the requesting user', async () => {
      await post('/api/classes', USER_A).send({ name: 'Mine' });
      await post('/api/classes', USER_B).send({ name: 'Theirs' });

      const res = await get('/api/classes', USER_A);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Mine');
    });
  });

  describe('POST /api/classes', () => {
    it('returns 400 when name is missing', async () => {
      const res = await post('/api/classes').send({ semester: 'A' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('creates a class and returns 201 with the class', async () => {
      const res = await post('/api/classes').send({ name: 'Physics', semester: 'B', year: 2025 });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'Physics', semester: 'B', year: 2025 });
      expect(res.body.id).toBeDefined();
    });

    it('creates a class with only a name', async () => {
      const res = await post('/api/classes').send({ name: 'History' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('History');
    });

    it('creates a class with a code', async () => {
      const res = await post('/api/classes').send({ name: 'Chemistry', semester: 'א', year: 2025, code: '10493' });
      expect(res.status).toBe(201);
      expect(res.body.code).toBe('10493');
    });

    it('creates a class with an opalCourseUrl', async () => {
      const res = await post('/api/classes').send({ name: 'Biology', semester: 'ב', year: 2026, opalCourseUrl: 'https://opal.example.com/course/456' });
      expect(res.status).toBe(201);
      expect(res.body.opalCourseUrl).toBe('https://opal.example.com/course/456');

      const list = await get('/api/classes');
      expect(list.body.find((c: any) => c.id === res.body.id).opalCourseUrl).toBe('https://opal.example.com/course/456');
    });
  });

  describe('POST /api/classes/opal-metadata', () => {
    it('returns 400 when opalCourseUrl is missing', async () => {
      const res = await post('/api/classes/opal-metadata').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('returns 400 when OPAL credentials are missing', async () => {
      const res = await post('/api/classes/opal-metadata').send({ opalCourseUrl: 'https://opal.example.com/course/1' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('POST /api/classes/:classId/detect', () => {
    it('returns 404 for unknown classId', async () => {
      const res = await post('/api/classes/nonexistent/detect').send(OPAL_CREDS);
      expect(res.status).toBe(404);
      expect(detectNewLectures).not.toHaveBeenCalled();
    });

    it('returns 404 when another user owns the class', async () => {
      const created = await post('/api/classes', USER_A).send({ name: 'Bio' });

      const res = await post(`/api/classes/${created.body.id}/detect`, USER_B).send(OPAL_CREDS);
      expect(res.status).toBe(404);
      expect(detectNewLectures).not.toHaveBeenCalled();
    });

    it('returns 400 when OPAL credentials are missing', async () => {
      const created = await post('/api/classes').send({ name: 'Bio' });

      const res = await post(`/api/classes/${created.body.id}/detect`).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(detectNewLectures).not.toHaveBeenCalled();
    });

    it('creates and returns newly detected lectures', async () => {
      const created = await post('/api/classes').send({ name: 'Bio', opalCourseUrl: 'https://opal.example.com/course/1' });
      detectNewLectures.mockResolvedValue([
        { name: 'Lecture 1', url: 'https://opal.example.com/v/1', lectureDate: '2026-01-01' },
      ]);

      const res = await post(`/api/classes/${created.body.id}/detect`).send(OPAL_CREDS);
      expect(res.status).toBe(201);
      expect(res.body.newLectures).toHaveLength(1);
      expect(res.body.newLectures[0]).toMatchObject({ name: 'Lecture 1', url: 'https://opal.example.com/v/1' });
      expect(detectNewLectures).toHaveBeenCalledWith(created.body.id, { username: 'u', password: 'p', id: 'id' });

      const list = await get('/api/classes');
      expect(list.body.find((c: any) => c.id === created.body.id).lectureCount).toBe(1);
    });

    it('returns an empty list when nothing new is found', async () => {
      const created = await post('/api/classes').send({ name: 'Bio' });
      detectNewLectures.mockResolvedValue([]);

      const res = await post(`/api/classes/${created.body.id}/detect`).send(OPAL_CREDS);
      expect(res.status).toBe(201);
      expect(res.body.newLectures).toEqual([]);
    });

    it('returns 502 when detection fails', async () => {
      const created = await post('/api/classes').send({ name: 'Bio' });
      detectNewLectures.mockRejectedValue(new Error('OPAL login failed'));

      const res = await post(`/api/classes/${created.body.id}/detect`).send(OPAL_CREDS);
      expect(res.status).toBe(502);
      expect(res.body.error).toBe('OPAL login failed');
    });
  });

  describe('PATCH /api/classes/:classId', () => {
    it('returns 404 for unknown classId', async () => {
      const res = await patch('/api/classes/nonexistent').send({ opalCourseUrl: 'https://example.com' });
      expect(res.status).toBe(404);
    });

    it('updates opalCourseUrl', async () => {
      const created = await post('/api/classes').send({ name: 'Bio' });

      const res = await patch(`/api/classes/${created.body.id}`).send({ opalCourseUrl: 'https://opal.example.com/course/123' });
      expect(res.status).toBe(200);
      expect(res.body.opalCourseUrl).toBe('https://opal.example.com/course/123');
    });

    it('updates code, semester and year', async () => {
      const created = await post('/api/classes').send({ name: 'Bio' });

      const res = await patch(`/api/classes/${created.body.id}`).send({ code: '10493', semester: 'ב', year: 2026 });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ code: '10493', semester: 'ב', year: 2026 });
    });

    it('returns 404 when another user owns the class', async () => {
      const created = await post('/api/classes', USER_A).send({ name: 'Bio' });

      const res = await patch(`/api/classes/${created.body.id}`, USER_B).send({ code: '10493' });
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/classes/:classId', () => {
    it('returns 404 for unknown classId', async () => {
      const res = await del('/api/classes/nonexistent');
      expect(res.status).toBe(404);
    });

    it('deletes the class and returns ok', async () => {
      const created = await post('/api/classes').send({ name: 'Temp' });

      const delRes = await del(`/api/classes/${created.body.id}`);
      expect(delRes.status).toBe(200);
      expect(delRes.body.ok).toBe(true);

      const list = await get('/api/classes');
      expect(list.body).toHaveLength(0);
    });

    it('cascades — class disappears from list after delete', async () => {
      const c1 = await post('/api/classes').send({ name: 'Keep' });
      const c2 = await post('/api/classes').send({ name: 'Delete' });

      await del(`/api/classes/${c2.body.id}`);

      const list = await get('/api/classes');
      expect(list.body).toHaveLength(1);
      expect(list.body[0].name).toBe('Keep');
    });

    it('returns 404 when another user owns the class', async () => {
      const created = await post('/api/classes', USER_A).send({ name: 'Bio' });

      const res = await del(`/api/classes/${created.body.id}`, USER_B);
      expect(res.status).toBe(404);
    });
  });
});
