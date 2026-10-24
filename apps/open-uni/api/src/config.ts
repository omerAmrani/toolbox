import { mkdirSync } from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';

const envPath =
  process.env.NODE_ENV === 'test'
    ? '.env.test'
    : process.env.NODE_ENV === 'production'
      ? '/etc/secrets/.env'
      : '.env';

dotenv.config({ path: envPath });

// OPAL/AI credentials are read from here in local mode and checked per
// feature at call time (see src/credentials.ts, docs/adr/0002).

export const {
  WHISPER_PROMPT = 'הרצאה אקדמית. עשוי להכיל מונחים טכניים באנגלית.',
  WHISPER_CONCURRENCY = '2',
  SUMMARIZE_BACKEND = 'gemini',
  GEMINI_MODEL = 'gemini-2.5-flash',
  CLAUDE_MODEL = 'claude-haiku-4-5-20251001',
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  PORT = '3001',
  WEB_ORIGIN = 'http://127.0.0.1:3002',
  API_ORIGIN = `http://127.0.0.1:${process.env.PORT || '3001'}`,
  JWT_SECRET,
  OPENU_USERNAME,
  OPENU_PASSWORD,
  OPENU_ID,
  GROQ_API_KEY,
  GEMINI_API_KEY,
  ANTHROPIC_API_KEY,
  DATA_DIR,
  DEBUG,
} = process.env;

export const GOOGLE_REDIRECT_URI = `${API_ORIGIN}/api/auth/google/callback`;

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
export const IS_TEST = process.env.NODE_ENV === 'test';

// Local mode (no Google OAuth configured): no login, one fixed local user,
// API bound to 127.0.0.1 only — see docs/adr/0002.
export const IS_LOCAL_MODE = !GOOGLE_CLIENT_ID;

// Only Google mode signs JWTs; local mode never touches them.
if (!IS_LOCAL_MODE && !JWT_SECRET && !IS_TEST) {
  throw new Error('JWT_SECRET is required when Google login is enabled — set it in .env (e.g. `openssl rand -hex 32`)');
}

export const MERGE_MAX_TOKENS = 16384;

export const TMP_DIR = path.join(__dirname, '..', 'tmp');
mkdirSync(TMP_DIR, { recursive: true });
