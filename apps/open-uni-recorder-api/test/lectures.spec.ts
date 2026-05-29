import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { LecturesModule } from '../src/modules/lectures/lectures.module';
import { DownloadService } from '../src/modules/download/download.service';
import { SummarizeService } from '../src/modules/summarize/summarize.service';
import { QaService } from '../src/modules/qa/qa.service';
import { ClassesModule } from '../src/modules/classes/classes.module';
import { StorageService } from '../src/modules/storage/storage.service';
import { truncateAll, cleanClassesDir } from './helpers/db';

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

const mockQa = {
  generateQuestions: jest.fn().mockResolvedValue(['Question 1?', 'Question 2?', 'Question 3?']),
  evaluateAnswers: jest.fn().mockResolvedValue([
    { correct: true, explanation: 'Correct!' },
    { correct: false, explanation: 'Not quite.' },
    { correct: true, explanation: 'Correct!' },
  ]),
};

function parseSSE(raw: string): any[] {
  return raw
    .split('\n\n')
    .filter(chunk => chunk.startsWith('data: '))
    .map(chunk => JSON.parse(chunk.slice(6)));
}

describe('LecturesController', () => {
  let app: INestApplication;
  let storage: StorageService;
  let classId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ClassesModule, LecturesModule],
    })
      .overrideProvider(DownloadService).useValue(mockDownload)
      .overrideProvider(SummarizeService).useValue(mockSummarize)
      .overrideProvider(QaService).useValue(mockQa)
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
    const cls = await request(app.getHttpServer())
      .post('/api/classes')
      .send({ name: 'Test Class' });
    classId = cls.body.id;
  });

  // ── Lectures CRUD ──────────────────────────────────────────────────────────

  describe('GET /api/classes/:classId/lectures', () => {
    it('returns 404 for unknown class', async () => {
      const res = await request(app.getHttpServer()).get('/api/classes/bad-id/lectures');
      expect(res.status).toBe(404);
    });

    it('returns empty array for class with no lectures', async () => {
      const res = await request(app.getHttpServer()).get(`/api/classes/${classId}/lectures`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('POST /api/classes/:classId/lectures', () => {
    it('returns 400 when name is missing', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ url: 'https://example.com/lecture' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when url is missing', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'Lecture 1' });
      expect(res.status).toBe(400);
    });

    it('returns 404 for unknown class', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/classes/bad-id/lectures')
        .send({ name: 'L', url: 'https://example.com' });
      expect(res.status).toBe(404);
    });

    it('creates lecture with default pending status', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'Lecture 1', url: 'https://example.com/1' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: 'Lecture 1', status: 'pending' });
      expect(res.body.id).toBeDefined();
    });

    it('creates lecture with skipped status when requested', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L2', url: 'https://example.com/2', status: 'skipped' });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('skipped');
    });

    it('ignores invalid status and defaults to pending', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L3', url: 'https://example.com/3', status: 'summarized' });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('pending');
    });
  });

  describe('DELETE /api/classes/:classId/lectures/:lectureId', () => {
    it('returns 404 for unknown lecture', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/classes/${classId}/lectures/nonexistent`);
      expect(res.status).toBe(404);
    });

    it('deletes lecture and returns ok', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'Delete Me', url: 'https://example.com' });

      const del = await request(app.getHttpServer())
        .delete(`/api/classes/${classId}/lectures/${created.body.id}`);
      expect(del.status).toBe(200);
      expect(del.body.ok).toBe(true);

      const list = await request(app.getHttpServer()).get(`/api/classes/${classId}/lectures`);
      expect(list.body).toHaveLength(0);
    });
  });

  describe('PATCH /api/classes/:classId/lectures/:lectureId', () => {
    it('updates lecture name and lectureDate', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'Original', url: 'https://example.com' });

      const res = await request(app.getHttpServer())
        .patch(`/api/classes/${classId}/lectures/${created.body.id}`)
        .send({ name: 'Updated', lectureDate: '2025-01-15' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated');
      expect(res.body.lectureDate).toBe('2025-01-15');
    });
  });

  // ── Status transitions ─────────────────────────────────────────────────────

  describe('GET /api/classes/:classId/lectures/:lectureId/status', () => {
    it('returns full lecture object', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });

      const res = await request(app.getHttpServer())
        .get(`/api/classes/${classId}/lectures/${created.body.id}/status`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('pending');
    });

    it('returns 404 for unknown lecture', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/classes/${classId}/lectures/bad/status`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST .../skip and .../unskip', () => {
    it('skips a pending lecture', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });
      const id = created.body.id;

      const skip = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures/${id}/skip`);
      expect(skip.status).toBe(201);
      expect(skip.body.status).toBe('skipped');
    });

    it('returns 400 when skipping a non-pending lecture', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com', status: 'skipped' });

      const res = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures/${created.body.id}/skip`);
      expect(res.status).toBe(400);
    });

    it('unskips a skipped lecture back to pending', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com', status: 'skipped' });
      const id = created.body.id;

      const unskip = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures/${id}/unskip`);
      expect(unskip.status).toBe(201);
      expect(unskip.body.status).toBe('pending');
    });
  });

  describe('POST .../retry', () => {
    it('returns 400 when lecture is not failed', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });

      const res = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures/${created.body.id}/retry`);
      expect(res.status).toBe(400);
    });

    it('retries a failed lecture back to pending', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });
      const id = created.body.id;

      storage.updateLectureMeta(classId, id, { status: 'failed', lastError: 'boom' });

      const res = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures/${id}/retry`);
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('pending');
      expect(res.body.lastError).toBeNull();
    });
  });

  // ── File endpoints ─────────────────────────────────────────────────────────

  describe('GET .../transcript', () => {
    it('returns 404 when no transcript exists', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });

      const res = await request(app.getHttpServer())
        .get(`/api/classes/${classId}/lectures/${created.body.id}/transcript`);
      expect(res.status).toBe(404);
    });

    it('returns transcript text when file exists', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });
      const id = created.body.id;

      const dir = storage.lectureDirPath(classId, id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'transcript.txt'), 'Hello transcript');

      const res = await request(app.getHttpServer())
        .get(`/api/classes/${classId}/lectures/${id}/transcript`);
      expect(res.status).toBe(200);
      expect(res.text).toBe('Hello transcript');
    });
  });

  describe('GET .../summary', () => {
    it('returns 404 when no summary exists', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });

      const res = await request(app.getHttpServer())
        .get(`/api/classes/${classId}/lectures/${created.body.id}/summary`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET .../summaries', () => {
    it('returns empty versions when no summaries', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });

      const res = await request(app.getHttpServer())
        .get(`/api/classes/${classId}/lectures/${created.body.id}/summaries`);
      expect(res.status).toBe(200);
      expect(res.body.versions).toEqual([]);
      expect(res.body.currentSummary).toBeNull();
    });
  });

  // ── Summarize SSE ──────────────────────────────────────────────────────────

  describe('POST .../summarize', () => {
    it('returns 400 when no transcript exists', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });

      const res = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures/${created.body.id}/summarize`);
      expect(res.status).toBe(400);
    });

    it('streams SSE events and saves summary when transcript exists', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });
      const id = created.body.id;

      const dir = storage.lectureDirPath(classId, id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'transcript.txt'), 'Test transcript for summarization');

      const res = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures/${id}/summarize`)
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

      const statusRes = await request(app.getHttpServer())
        .get(`/api/classes/${classId}/lectures/${id}/status`);
      expect(statusRes.body.status).toBe('summarized');
    });
  });

  // ── Q&A ────────────────────────────────────────────────────────────────────

  describe('GET .../qa', () => {
    it('returns empty rounds when no qa.json exists', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });

      const res = await request(app.getHttpServer())
        .get(`/api/classes/${classId}/lectures/${created.body.id}/qa`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ rounds: [] });
    });
  });

  describe('POST .../qa/generate', () => {
    it('returns 400 when no summary exists', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });

      const res = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures/${created.body.id}/qa/generate`);
      expect(res.status).toBe(400);
    });

    it('generates questions from summary and saves a Q&A round', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });
      const id = created.body.id;

      storage.saveSummaryVersion(classId, id, 'Test summary', 'gemini');

      const res = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures/${id}/qa/generate`);
      expect(res.status).toBe(201);
      expect(res.body.questions).toHaveLength(3);
      expect(res.body.roundIndex).toBe(0);
      expect(mockQa.generateQuestions).toHaveBeenCalledWith('Test summary');
    });
  });

  describe('POST .../qa/answer', () => {
    it('evaluates answers and returns feedback', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });
      const id = created.body.id;

      storage.saveSummaryVersion(classId, id, 'Test summary', 'gemini');
      await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures/${id}/qa/generate`);

      const res = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures/${id}/qa/answer`)
        .send({ roundIndex: 0, answers: ['Answer 1', 'Answer 2', 'Answer 3'] });

      expect(res.status).toBe(201);
      expect(res.body.feedback).toHaveLength(3);
      expect(res.body.feedback[0].correct).toBe(true);
    });
  });

  // ── Transcribe SSE ─────────────────────────────────────────────────────────

  describe('POST .../transcribe', () => {
    it('streams SSE events and sets status to transcribed on success', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });
      const id = created.body.id;

      const res = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures/${id}/transcribe`)
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

      const statusRes = await request(app.getHttpServer())
        .get(`/api/classes/${classId}/lectures/${id}/status`);
      expect(statusRes.body.status).toBe('transcribed');
    });

    it('streams error event and sets status to error when download throws', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });
      const id = created.body.id;

      mockDownload.extractVideoUrl.mockRejectedValueOnce(new Error('Login failed'));

      const res = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures/${id}/transcribe`)
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

      const statusRes = await request(app.getHttpServer())
        .get(`/api/classes/${classId}/lectures/${id}/status`);
      expect(statusRes.body.status).toBe('error');
    });
  });

  // ── Summary version CRUD ───────────────────────────────────────────────────

  describe('GET .../summaries/:summaryId', () => {
    it('returns 404 for unknown summary id', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });

      const res = await request(app.getHttpServer())
        .get(`/api/classes/${classId}/lectures/${created.body.id}/summaries/nonexistent`);
      expect(res.status).toBe(404);
    });

    it('returns summary text for a known summary id', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });
      const id = created.body.id;

      const summaryId = storage.saveSummaryVersion(classId, id, 'Version content', 'gemini');

      const res = await request(app.getHttpServer())
        .get(`/api/classes/${classId}/lectures/${id}/summaries/${summaryId}`);
      expect(res.status).toBe(200);
      expect(res.text).toBe('Version content');
    });
  });

  describe('PUT .../summaries/:summaryId/current', () => {
    it('returns 404 for unknown summary id', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });

      const res = await request(app.getHttpServer())
        .put(`/api/classes/${classId}/lectures/${created.body.id}/summaries/nonexistent/current`);
      expect(res.status).toBe(404);
    });

    it('sets a summary version as current', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });
      const id = created.body.id;

      const targetId = storage.saveSummaryVersion(classId, id, 'v1 content', 'gemini');

      const res = await request(app.getHttpServer())
        .put(`/api/classes/${classId}/lectures/${id}/summaries/${targetId}/current`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const summary = await request(app.getHttpServer())
        .get(`/api/classes/${classId}/lectures/${id}/summary`);
      expect(summary.text).toBe('v1 content');
    });
  });

  describe('DELETE .../summaries/:summaryId', () => {
    it('returns 404 for unknown summary id', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });

      const res = await request(app.getHttpServer())
        .delete(`/api/classes/${classId}/lectures/${created.body.id}/summaries/nonexistent`);
      expect(res.status).toBe(404);
    });

    it('deletes a summary version', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });
      const id = created.body.id;

      const summaryId = storage.saveSummaryVersion(classId, id, 'to delete', 'gemini');

      const res = await request(app.getHttpServer())
        .delete(`/api/classes/${classId}/lectures/${id}/summaries/${summaryId}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const afterDelete = storage.getSummaryVersions(classId, id);
      expect(afterDelete.versions).toHaveLength(0);
    });
  });

  // ── Abort ──────────────────────────────────────────────────────────────────

  describe('POST .../abort', () => {
    it('returns 400 when type is invalid', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });

      const res = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures/${created.body.id}/abort`)
        .send({ type: 'invalid' });
      expect(res.status).toBe(400);
    });

    it('returns 404 when no active job', async () => {
      const created = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures`)
        .send({ name: 'L', url: 'https://example.com' });

      const res = await request(app.getHttpServer())
        .post(`/api/classes/${classId}/lectures/${created.body.id}/abort`)
        .send({ type: 'transcribe' });
      expect(res.status).toBe(404);
    });
  });
});
