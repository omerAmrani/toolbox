import { mkdirSync } from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

// OPAL/AI credentials are no longer read from here — they're per-user,
// client-side encrypted, and sent per-request (see src/credentials.ts).

export const {
  WHISPER_PROMPT = 'הרצאה אקדמית. עשוי להכיל מונחים טכניים באנגלית.',
  WHISPER_CONCURRENCY = '2',
  SUMMARIZE_BACKEND = 'gemini',
  GEMINI_MODEL = 'gemini-2.5-flash',
  CLAUDE_MODEL = 'claude-haiku-4-5-20251001',
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  PORT = '3001',
  WEB_ORIGIN = 'http://127.0.0.1:3002',
  API_ORIGIN = `http://127.0.0.1:${process.env.PORT || '3001'}`,
  JWT_SECRET,
} = process.env;

if (!JWT_SECRET && process.env.NODE_ENV !== 'test') {
  throw new Error('JWT_SECRET is required — set it in .env (e.g. `openssl rand -hex 32`)');
}

export const MERGE_MAX_TOKENS = 16384;

export const TMP_DIR = path.join(__dirname, '..', 'tmp');
mkdirSync(TMP_DIR, { recursive: true });
