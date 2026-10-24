import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as config from '../src/config';
import { HealthModule } from '../src/modules/health/health.module';
import { StorageModule } from '../src/modules/storage/storage.module';
import { AppController } from '../src/app.controller';

// SDK constructors are mocked so no real API calls are made. Keys come from
// the API's .env (.env.test here — see docs/health.md).

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
      imports: [HealthModule, StorageModule],
      controllers: [AppController],
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

  describe('GET /health/ping', () => {
    it('returns ok:true with no auth or external calls', async () => {
      const res = await request(app.getHttpServer()).get('/health/ping');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });

  describe('GET /api/config/status', () => {
    it('reports which keys are set as booleans, never their values', async () => {
      const claude = jest.replaceProperty(config, 'ANTHROPIC_API_KEY', undefined);
      const res = await request(app.getHttpServer()).get('/api/config/status');
      claude.restore();

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ localMode: false, opal: true, groq: true, gemini: true, claude: false });
    });
  });

  describe('POST /health/gemini', () => {
    it('returns configured:false when GEMINI_API_KEY is not in .env', async () => {
      const gemini = jest.replaceProperty(config, 'GEMINI_API_KEY', undefined);
      const res = await request(app.getHttpServer()).post('/health/gemini');
      gemini.restore();
      expect(res.status).toBe(200);
      expect(res.body.configured).toBe(false);
      expect(res.body.ok).toBe(false);
    });

    it('returns ok:true with latency when API responds', async () => {
      mockGenerate.mockResolvedValue({ response: { text: () => 'ok' } });

      const res = await request(app.getHttpServer()).post('/health/gemini');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.configured).toBe(true);
      expect(res.body.response).toBe('ok');
      expect(typeof res.body.ms).toBe('number');
    });

    it('returns ok:false with error message when API throws', async () => {
      mockGenerate.mockRejectedValue(new Error('quota exceeded'));

      const res = await request(app.getHttpServer()).post('/health/gemini');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.configured).toBe(true);
      expect(res.body.error).toBe('quota exceeded');
    });
  });

  describe('POST /health/claude', () => {
    it('returns ok:true with latency when API responds', async () => {
      mockMessagesCreate.mockResolvedValue({ content: [{ text: 'ok' }] });

      const res = await request(app.getHttpServer()).post('/health/claude');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.configured).toBe(true);
      expect(res.body.response).toBe('ok');
      expect(typeof res.body.ms).toBe('number');
    });

    it('returns ok:false with error message when API throws', async () => {
      mockMessagesCreate.mockRejectedValue(new Error('invalid api key'));

      const res = await request(app.getHttpServer()).post('/health/claude');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.configured).toBe(true);
      expect(res.body.error).toBe('invalid api key');
    });
  });
});
