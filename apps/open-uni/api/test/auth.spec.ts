import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthModule } from '../src/modules/auth/auth.module';
import { AuthService } from '../src/modules/auth/auth.service';
import { AUTH_COOKIE } from '../src/common/jwt-auth.guard';
import { WEB_ORIGIN, GOOGLE_CLIENT_ID } from '../src/config';
import { truncateAll } from './helpers/db';

const mockGetToken = jest.fn();
const mockVerifyIdToken = jest.fn();
const mockGenerateAuthUrl = jest.fn();

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    generateAuthUrl: mockGenerateAuthUrl,
    getToken: mockGetToken,
    verifyIdToken: mockVerifyIdToken,
  })),
}));

function mockGoogleUser(email: string, verified = true) {
  mockGetToken.mockResolvedValue({ tokens: { id_token: 'mock-id-token' } });
  mockVerifyIdToken.mockResolvedValue({ getPayload: () => ({ email, email_verified: verified }) });
}

describe('AuthController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AuthModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    truncateAll();
    mockGenerateAuthUrl.mockReset();
    mockGetToken.mockReset();
    mockVerifyIdToken.mockReset();
  });

  describe('GET /api/auth/google', () => {
    it('redirects to the Google consent URL', async () => {
      mockGenerateAuthUrl.mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?mock=1');
      const res = await request(app.getHttpServer()).get('/api/auth/google');
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://accounts.google.com/o/oauth2/v2/auth?mock=1');
    });
  });

  describe('GET /api/auth/google/callback', () => {
    it('redirects to the login error page for a failed exchange', async () => {
      mockGetToken.mockRejectedValue(new Error('invalid_grant'));
      const res = await request(app.getHttpServer()).get('/api/auth/google/callback').query({ code: 'bad-code' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`${WEB_ORIGIN}/login?error=oauth_failed`);
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('redirects to the login error page for an unverified email', async () => {
      mockGoogleUser('unverified@example.com', false);
      const res = await request(app.getHttpServer()).get('/api/auth/google/callback').query({ code: 'some-code' });
      expect(res.headers.location).toBe(`${WEB_ORIGIN}/login?error=oauth_failed`);
    });

    it('creates a user, sets the auth cookie, and redirects home on success', async () => {
      mockGoogleUser('Person@Example.com');
      const res = await request(app.getHttpServer()).get('/api/auth/google/callback').query({ code: 'good-code' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(WEB_ORIGIN);
      expect(res.headers['set-cookie']?.[0]).toContain(`${AUTH_COOKIE}=`);
    });

    it('reuses the same user on a second login for the same email', async () => {
      mockGoogleUser('repeat@example.com');
      const first = await request(app.getHttpServer()).get('/api/auth/google/callback').query({ code: 'code-1' });
      const firstMe = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', first.headers['set-cookie'][0]);

      const second = await request(app.getHttpServer()).get('/api/auth/google/callback').query({ code: 'code-2' });
      const secondMe = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', second.headers['set-cookie'][0]);

      expect(secondMe.body.id).toBe(firstMe.body.id);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns 401 without a session cookie', async () => {
      const res = await request(app.getHttpServer()).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns the logged-in user for a valid session', async () => {
      mockGoogleUser('me@example.com');
      const loginRes = await request(app.getHttpServer()).get('/api/auth/google/callback').query({ code: 'good-code' });
      const cookie = loginRes.headers['set-cookie'][0];

      const res = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('me@example.com');
      expect(res.body.id).toBeDefined();
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears the auth cookie', async () => {
      const res = await request(app.getHttpServer()).post('/api/auth/logout');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.headers['set-cookie']?.[0]).toContain(`${AUTH_COOKIE}=;`);
    });
  });

  describe('Google OAuth (AuthService)', () => {
    let authService: AuthService;

    beforeAll(() => {
      authService = app.get(AuthService);
    });

    it('getGoogleAuthUrl builds a URL via the configured client', () => {
      mockGenerateAuthUrl.mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?mock=1');
      const url = authService.getGoogleAuthUrl();
      expect(url).toBe('https://accounts.google.com/o/oauth2/v2/auth?mock=1');
      expect(mockGenerateAuthUrl).toHaveBeenCalledWith({ scope: ['openid', 'email'] });
    });

    it('handleGoogleCallback returns the verified email', async () => {
      mockGoogleUser('Person@Example.com');
      const result = await authService.handleGoogleCallback('mock-code');
      expect(result.email).toBe('person@example.com');
      expect(mockGetToken).toHaveBeenCalledWith('mock-code');
      expect(mockVerifyIdToken).toHaveBeenCalledWith({ idToken: 'mock-id-token', audience: GOOGLE_CLIENT_ID });
    });

    it('handleGoogleCallback rejects an unverified email', async () => {
      mockGoogleUser('unverified@example.com', false);
      await expect(authService.handleGoogleCallback('mock-code')).rejects.toThrow('no verified email');
    });

    it('handleGoogleCallback rejects a missing id_token', async () => {
      mockGetToken.mockResolvedValue({ tokens: {} });
      await expect(authService.handleGoogleCallback('mock-code')).rejects.toThrow('did not return an id token');
    });
  });
});
