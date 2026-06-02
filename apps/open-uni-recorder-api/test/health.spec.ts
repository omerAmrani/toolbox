import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HealthModule } from '../src/modules/health/health.module';

// SDK constructors are mocked so no real API calls are made.
// GEMINI_API_KEY and ANTHROPIC_API_KEY are set to 'dummy' in .env.test so the
// controller sees a truthy key and proceeds to call the (mocked) SDK.

const mockGenerate = jest.fn();
const mockGetModel = jest.fn().mockReturnValue({ generateContent: mockGenerate });

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({ getGenerativeModel: mockGetModel })),
}));

const mockMessagesCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockMessagesCreate },
  })),
}));

describe('HealthController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/health/features', () => {
    it('returns an entry for every known feature', async () => {
      const res = await request(app.getHttpServer()).get('/api/health/features');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const features = res.body.map((f: any) => f.feature);
      expect(features).toContain('transcription');
      expect(features).toContain('summarization');
      expect(features).toContain('lecture-download');
      expect(features).toContain('email-notifications');
    });

    it('returns only feature and available fields — no env var names', async () => {
      const res = await request(app.getHttpServer()).get('/api/health/features');
      for (const entry of res.body) {
        expect(Object.keys(entry).sort()).toEqual(['available', 'feature']);
      }
    });

    it('reports features with keys set as available, and email-notifications as unavailable (not in env.test)', async () => {
      const res = await request(app.getHttpServer()).get('/api/health/features');
      const byName = Object.fromEntries(res.body.map((f: any) => [f.feature, f.available]));
      expect(byName['transcription']).toBe(true);
      expect(byName['summarization']).toBe(true);
      expect(byName['lecture-download']).toBe(true);
      expect(byName['email-notifications']).toBe(false);
    });
  });

  describe('GET /api/health/gemini', () => {
    it('returns ok:true with latency when API responds', async () => {
      mockGenerate.mockResolvedValue({ response: { text: () => 'ok' } });

      const res = await request(app.getHttpServer()).get('/api/health/gemini');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.configured).toBe(true);
      expect(res.body.response).toBe('ok');
      expect(typeof res.body.ms).toBe('number');
    });

    it('returns ok:false with error message when API throws', async () => {
      mockGenerate.mockRejectedValue(new Error('quota exceeded'));

      const res = await request(app.getHttpServer()).get('/api/health/gemini');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.configured).toBe(true);
      expect(res.body.error).toBe('quota exceeded');
    });
  });

  describe('GET /api/health/claude', () => {
    it('returns ok:true with latency when API responds', async () => {
      mockMessagesCreate.mockResolvedValue({ content: [{ text: 'ok' }] });

      const res = await request(app.getHttpServer()).get('/api/health/claude');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.configured).toBe(true);
      expect(res.body.response).toBe('ok');
      expect(typeof res.body.ms).toBe('number');
    });

    it('returns ok:false with error message when API throws', async () => {
      mockMessagesCreate.mockRejectedValue(new Error('invalid api key'));

      const res = await request(app.getHttpServer()).get('/api/health/claude');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.configured).toBe(true);
      expect(res.body.error).toBe('invalid api key');
    });
  });
});
