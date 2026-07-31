import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthModule } from '../src/modules/auth/auth.module';
import { EmailService } from '../src/modules/email/email.service';
import { AUTH_COOKIE } from '../src/common/jwt-auth.guard';
import { WEB_ORIGIN } from '../src/config';
import { truncateAll } from './helpers/db';

function extractToken(verifyUrl: string): string {
  return new URL(verifyUrl).searchParams.get('token')!;
}

describe('AuthController', () => {
  let app: INestApplication;
  const sendMagicLink = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AuthModule],
    })
      .overrideProvider(EmailService)
      .useValue({ sendMagicLink })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    truncateAll();
    sendMagicLink.mockClear();
  });

  describe('POST /api/auth/request-link', () => {
    it('rejects a missing/invalid email', async () => {
      const res = await request(app.getHttpServer()).post('/api/auth/request-link').send({});
      expect(res.status).toBe(400);
      expect(sendMagicLink).not.toHaveBeenCalled();
    });

    it('sends a magic link for a valid email', async () => {
      const res = await request(app.getHttpServer()).post('/api/auth/request-link').send({ email: 'Person@Example.com' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(sendMagicLink).toHaveBeenCalledTimes(1);
      const [to] = sendMagicLink.mock.calls[0];
      expect(to).toBe('person@example.com'); // normalized
    });

    it('rate-limits repeated requests for the same email', async () => {
      await request(app.getHttpServer()).post('/api/auth/request-link').send({ email: 'rate@example.com' });
      await request(app.getHttpServer()).post('/api/auth/request-link').send({ email: 'rate@example.com' });
      expect(sendMagicLink).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /api/auth/verify', () => {
    it('redirects to an error page for an invalid token', async () => {
      const res = await request(app.getHttpServer()).get('/api/auth/verify').query({ token: 'bogus' });
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(`${WEB_ORIGIN}/login?error=invalid_link`);
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('consumes a valid token, sets the auth cookie, and redirects home', async () => {
      await request(app.getHttpServer()).post('/api/auth/request-link').send({ email: 'verify@example.com' });
      const token = extractToken(sendMagicLink.mock.calls[0][1]);

      const res = await request(app.getHttpServer()).get('/api/auth/verify').query({ token });
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(WEB_ORIGIN);
      expect(res.headers['set-cookie']?.[0]).toContain(`${AUTH_COOKIE}=`);
    });

    it('rejects reusing an already-consumed token', async () => {
      await request(app.getHttpServer()).post('/api/auth/request-link').send({ email: 'reuse@example.com' });
      const token = extractToken(sendMagicLink.mock.calls[0][1]);

      await request(app.getHttpServer()).get('/api/auth/verify').query({ token });
      const second = await request(app.getHttpServer()).get('/api/auth/verify').query({ token });
      expect(second.headers.location).toBe(`${WEB_ORIGIN}/login?error=invalid_link`);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns 401 without a session cookie', async () => {
      const res = await request(app.getHttpServer()).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns the logged-in user for a valid session', async () => {
      await request(app.getHttpServer()).post('/api/auth/request-link').send({ email: 'me@example.com' });
      const token = extractToken(sendMagicLink.mock.calls[0][1]);
      const verifyRes = await request(app.getHttpServer()).get('/api/auth/verify').query({ token });
      const cookie = verifyRes.headers['set-cookie'][0];

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
});
