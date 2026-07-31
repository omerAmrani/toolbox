import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { LecturesModule } from '../src/modules/lectures/lectures.module';
import { DownloadService } from '../src/modules/download/download.service';
import { SummarizeService } from '../src/modules/summarize/summarize.service';
import { ClassesModule } from '../src/modules/classes/classes.module';
import { StorageService } from '../src/modules/storage/storage.service';
import { truncateAll, cleanClassesDir } from './helpers/db';
import { authCookie } from './helpers/auth';
import { tryAcquireJobSlot, releaseJobSlot } from '../src/job-guard';

const mockDownload = {
  extractVideoUrl: jest.fn().mockResolvedValue('https://example.com/video.mp4'),
  downloadAndTranscribe: jest.fn().mockResolvedValue('Mock transcript content'),
};

const mockSummarize = {
  getSummarizer: jest.fn().mockResolvedValue({
    mergeSummaries: jest.fn().mockResolvedValue('Mock summary content'),
  }),
  withAbort: jest.fn().mockImplementation((p: Promise<any>) => p),
};

function parseSSE(raw: string): any[] {
  return raw
    .split('\n\n')
    .filter(chunk => chunk.startsWith('data: '))
    .map(chunk => JSON.parse(chunk.slice(6)));
}

const USER_A = 'user-a';
const USER_B = 'user-b';

describe('LecturesController', () => {
  let app: INestApplication;
  let storage: StorageService;
  let classId: string;

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

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ClassesModule, LecturesModule],
    })
      .overrideProvider(DownloadService).useValue(mockDownload)
      .overrideProvider(SummarizeService).useValue(mockSummarize)
      .compile();

    app = module.createNestApplication();
    await app.init();
    storage = module.get<StorageService>(StorageService);
  });

  afterAll(async () => {
    await app.close();
    cleanClassesDir();
  });

  beforeEach(async () => {
    truncateAll();
    jest.clearAllMocks();
    mockSummarize.getSummarizer.mockResolvedValue({
      mergeSummaries: jest.fn().mockResolvedValue('Mock summary content'),
    });
    mockSummarize.withAbort.mockImplementation((p: Promise<any>) => p);
    const cls = await post('/api/classes')
      .send({ name: 'Test Class' });
    classId = cls.body.id;
  });

  describe('auth', () => {
    it('returns 401 when not logged in', async () => {
      const res = await get(`/api/classes/${classId}/lectures`, null);
      expect(res.status).toBe(401);
    });

    it('returns 404 when another user owns the class', async () => {
      const res = await get(`/api/classes/${classId}/lectures`, USER_B);
      expect(res.status).toBe(404);
    });
  });

  // ── Lectures CRUD ──────────────────────────────────────────────────────────

  describe('GET /api/classes/:classId/lectures', () => {
    it('returns 404 for unknown class', async () => {
      const res = await get('/api/classes/bad-id/lectures');
      expect(res.status).toBe(404);
    });

    it('returns empty array for class with no lectures', async () => {
      const res = await get(`/api/classes/${classId}/lectures`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('POST /api/classes/:classId/lectures', () => {
    it('returns 400 when name is missing', async () => {
      const res = await post(`/api/classes/${classId}/lectures`)
        .send({ url: 'https://example.com/lecture' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when url is missing', async () => {
      const res = await post(`/api/classes/${classId}/lectures`)
        .send({ name: 'Lecture 1' });
      expect(res.status).toBe(400);
    });

    it('returns 404 for unknown class', async () => {
      const res = await post('/api/classes/bad-id/lectures')
        .send({ name: 'L', url: 'https://example.com' });
      expect(res.status).toBe(404);
    });

    it('creates lecture with default pending status', async () => {
      const res = await post(`/api/classes/${classId}/lectures`)
        .send({ name: 'Lecture 1', url: 'https://example.com/1' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'Lecture 1', status: 'pending' });
      expect(res.body.id).toBeDefined();
    });

    it('ignores client-supplied status and always defaults to pending', async () => {
      const res = await post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L3', url: 'https://example.com/3', status: 'summarized' });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('pending');
    });
  });

  describe('DELETE /api/classes/:classId/lectures/:lectureId', () => {
    it('returns 404 for unknown lecture', async () => {
      const res = await del(`/api/classes/${classId}/lectures/nonexistent`);
      expect(res.status).toBe(404);
    });

    it('deletes lecture and returns ok', async () => {
      const created = await post(`/api/classes/${classId}/lectures`)
        .send({ name: 'Delete Me', url: 'https://example.com' });

      const delRes = await del(`/api/classes/${classId}/lectures/${created.body.id}`);
      expect(delRes.status).toBe(200);
      expect(delRes.body.ok).toBe(true);

      const list = await get(`/api/classes/${classId}/lectures`);
      expect(list.body).toHaveLength(0);
    });
  });

  describe('PATCH /api/classes/:classId/lectures/:lectureId', () => {
    it('updates lecture name and lectureDate', async () => {
      const created = await post(`/api/classes/${classId}/lectures`)
        .send({ name: 'Original', url: 'https://example.com' });

      const res = await patch(`/api/classes/${classId}/lectures/${created.body.id}`)
        .send({ name: 'Updated', lectureDate: '2025-01-15' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated');
      expect(res.body.lectureDate).toBe('2025-01-15');
    });
  });

  // ── Status transitions ─────────────────────────────────────────────────────

  describe('GET /api/classes/:classId/lectures/:lectureId/status', () => {
    it('returns full lecture object', async () => {
      const created = await post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });

      const res = await get(`/api/classes/${classId}/lectures/${created.body.id}/status`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('pending');
    });

    it('returns 404 for unknown lecture', async () => {
      const res = await get(`/api/classes/${classId}/lectures/bad/status`);
      expect(res.status).toBe(404);
    });
  });

  // ── File endpoints ─────────────────────────────────────────────────────────

  describe('GET .../transcript', () => {
    it('returns 404 when no transcript exists', async () => {
      const created = await post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });

      const res = await get(`/api/classes/${classId}/lectures/${created.body.id}/transcript`);
      expect(res.status).toBe(404);
    });

    it('returns transcript text when file exists', async () => {
      const created = await post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });
      const id = created.body.id;

      const dir = storage.lectureDirPath(classId, id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'transcript.txt'), 'Hello transcript');

      const res = await get(`/api/classes/${classId}/lectures/${id}/transcript`);
      expect(res.status).toBe(200);
      expect(res.text).toBe('Hello transcript');
    });
  });

  describe('GET .../summary', () => {
    it('returns 404 when no summary exists', async () => {
      const created = await post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });

      const res = await get(`/api/classes/${classId}/lectures/${created.body.id}/summary`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET .../summaries', () => {
    it('returns empty versions when no summaries', async () => {
      const created = await post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });

      const res = await get(`/api/classes/${classId}/lectures/${created.body.id}/summaries`);
      expect(res.status).toBe(200);
      expect(res.body.versions).toEqual([]);
      expect(res.body.currentSummary).toBeNull();
    });
  });

  // ── Summarize SSE ──────────────────────────────────────────────────────────

  describe('POST .../summarize', () => {
    it('returns 400 when no transcript exists', async () => {
      const created = await post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });

      const res = await post(`/api/classes/${classId}/lectures/${created.body.id}/summarize`);
      expect(res.status).toBe(400);
    });

    it('streams SSE events and saves summary when transcript exists', async () => {
      const created = await post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });
      const id = created.body.id;

      const dir = storage.lectureDirPath(classId, id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'transcript.txt'), 'Test transcript for summarization');

      const res = await post(`/api/classes/${classId}/lectures/${id}/summarize`)
        .send({ geminiApiKey: 'test-gemini-key' })
        .buffer(true)
        .parse((response, callback) => {
          let data = '';
          response.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          response.on('end', () => callback(null, data));
        });

      const events = parseSSE(typeof res.body === 'string' ? res.body : res.text);
      const done = events.find((e: any) => e.type === 'done');
      expect(done).toBeDefined();
      expect(done.status).toBe('summarized');
      expect(done.summary).toBe('Mock summary content');

      const statusRes = await get(`/api/classes/${classId}/lectures/${id}/status`);
      expect(statusRes.body.status).toBe('summarized');
    });

    it('reverts status to transcribed with lastError when summarization throws', async () => {
      const created = await post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });
      const id = created.body.id;

      const dir = storage.lectureDirPath(classId, id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'transcript.txt'), 'Test transcript');

      mockSummarize.getSummarizer.mockResolvedValueOnce({
        mergeSummaries: jest.fn().mockRejectedValue(new Error('Summarizer failed')),
      });

      await post(`/api/classes/${classId}/lectures/${id}/summarize`)
        .send({ geminiApiKey: 'test-gemini-key' })
        .buffer(true)
        .parse((response, callback) => {
          let data = '';
          response.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          response.on('end', () => callback(null, data));
        });

      const statusRes = await get(`/api/classes/${classId}/lectures/${id}/status`);
      expect(statusRes.body.status).toBe('transcribed');
      expect(statusRes.body.lastError).toBe('Summarizer failed');
    });
  });

  // ── Transcribe SSE ─────────────────────────────────────────────────────────

  describe('POST .../transcribe', () => {
    it('streams SSE events and sets status to transcribed on success', async () => {
      const created = await post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });
      const id = created.body.id;

      const res = await post(`/api/classes/${classId}/lectures/${id}/transcribe`)
        .send({ opalUsername: 'u', opalPassword: 'p', opalId: '1', groqApiKey: 'test-groq-key' })
        .buffer(true)
        .parse((response, callback) => {
          let data = '';
          response.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          response.on('end', () => callback(null, data));
        });

      const events = parseSSE(typeof res.body === 'string' ? res.body : res.text);
      const done = events.find((e: any) => e.type === 'done');
      expect(done).toBeDefined();
      expect(done.status).toBe('transcribed');

      const statusRes = await get(`/api/classes/${classId}/lectures/${id}/status`);
      expect(statusRes.body.status).toBe('transcribed');
    });

    it('streams error event and reverts status to pending with lastError when download throws', async () => {
      const created = await post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });
      const id = created.body.id;

      mockDownload.extractVideoUrl.mockRejectedValueOnce(new Error('Login failed'));

      const res = await post(`/api/classes/${classId}/lectures/${id}/transcribe`)
        .send({ opalUsername: 'u', opalPassword: 'p', opalId: '1', groqApiKey: 'test-groq-key' })
        .buffer(true)
        .parse((response, callback) => {
          let data = '';
          response.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          response.on('end', () => callback(null, data));
        });

      const events = parseSSE(typeof res.body === 'string' ? res.body : res.text);
      const errorEvent = events.find((e: any) => e.type === 'error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent.message).toBe('Login failed');

      const statusRes = await get(`/api/classes/${classId}/lectures/${id}/status`);
      expect(statusRes.body.status).toBe('pending');
      expect(statusRes.body.lastError).toBe('Login failed');
    });

    it('rejects transcribe with 429 while the same user already holds the job slot, but allows another user', async () => {
      const lecture = await post(`/api/classes/${classId}/lectures`).send({ name: 'L1', url: 'https://example.com/1' });

      expect(tryAcquireJobSlot(USER_A)).toBe(true); // simulate a job already in flight for this user

      const sameUserRes = await post(`/api/classes/${classId}/lectures/${lecture.body.id}/transcribe`, USER_A)
        .send({ opalUsername: 'u', opalPassword: 'p', opalId: '1', groqApiKey: 'test-groq-key' });
      expect(sameUserRes.status).toBe(429);

      const otherClass = await post('/api/classes', USER_B).send({ name: 'B Class' });
      const otherLecture = await post(`/api/classes/${otherClass.body.id}/lectures`, USER_B).send({ name: 'L', url: 'https://example.com/3' });
      const otherUserRes = await post(`/api/classes/${otherClass.body.id}/lectures/${otherLecture.body.id}/transcribe`, USER_B)
        .send({ opalUsername: 'u', opalPassword: 'p', opalId: '1', groqApiKey: 'test-groq-key' })
        .buffer(true)
        .parse((response, callback) => {
          let data = '';
          response.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          response.on('end', () => callback(null, data));
        });
      expect(otherUserRes.status).not.toBe(429);

      releaseJobSlot(USER_A);
    });
  });

  // ── Summary version CRUD ───────────────────────────────────────────────────

  describe('GET .../summaries/:summaryId', () => {
    it('returns 404 for unknown summary id', async () => {
      const created = await post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });

      const res = await get(`/api/classes/${classId}/lectures/${created.body.id}/summaries/nonexistent`);
      expect(res.status).toBe(404);
    });

    it('returns summary text for a known summary id', async () => {
      const created = await post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });
      const id = created.body.id;

      const summaryId = storage.saveSummaryVersion(classId, id, 'Version content', 'gemini');

      const res = await get(`/api/classes/${classId}/lectures/${id}/summaries/${summaryId}`);
      expect(res.status).toBe(200);
      expect(res.text).toBe('Version content');
    });
  });

  describe('DELETE .../summaries/:summaryId', () => {
    it('returns 404 for unknown summary id', async () => {
      const created = await post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });

      const res = await del(`/api/classes/${classId}/lectures/${created.body.id}/summaries/nonexistent`);
      expect(res.status).toBe(404);
    });

    it('deletes a summary version', async () => {
      const created = await post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });
      const id = created.body.id;

      const summaryId = storage.saveSummaryVersion(classId, id, 'to delete', 'gemini');

      const res = await del(`/api/classes/${classId}/lectures/${id}/summaries/${summaryId}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const afterDelete = storage.getSummaryVersions(classId, id);
      expect(afterDelete.versions).toHaveLength(0);
    });
  });

  // ── Abort ──────────────────────────────────────────────────────────────────

  describe('POST .../abort', () => {
    it('returns 400 when type is invalid', async () => {
      const created = await post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });

      const res = await post(`/api/classes/${classId}/lectures/${created.body.id}/abort`)
        .send({ type: 'invalid' });
      expect(res.status).toBe(400);
    });

    it('returns 404 when no active job', async () => {
      const created = await post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });

      const res = await post(`/api/classes/${classId}/lectures/${created.body.id}/abort`)
        .send({ type: 'transcribe' });
      expect(res.status).toBe(404);
    });
  });
});
