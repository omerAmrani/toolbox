import { mkdirSync } from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

export const {
  OPENU_USERNAME,
  OPENU_PASSWORD,
  OPENU_ID,
  GROQ_API_KEY,
  GEMINI_API_KEY,
  ANTHROPIC_API_KEY,
  WHISPER_PROMPT = 'הרצאה אקדמית. עשוי להכיל מונחים טכניים באנגלית.',
  WHISPER_CONCURRENCY = '2',
  SUMMARIZE_BACKEND = 'gemini',
  GEMINI_MODEL = 'gemini-2.5-flash',
  CLAUDE_MODEL = 'claude-haiku-4-5-20251001',
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  NOTIFY_EMAIL,
  PORT = '3001',
  WEB_ORIGIN = 'http://localhost:3000',
} = process.env;

export const MERGE_MAX_TOKENS = 16384;

export const TMP_DIR = path.join(__dirname, '..', 'tmp');
mkdirSync(TMP_DIR, { recursive: true });
