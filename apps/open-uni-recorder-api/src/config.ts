import { mkdirSync } from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

export const {
  OPENU_USERNAME,
  OPENU_PASSWORD,
  OPENU_ID,
  GROQ_API_KEY,
  WHISPER_MODEL = 'small',
  WHISPER_BACKEND = 'groq-whisper',
  SUMMARIZE_BACKEND = 'gemini',
  OUTPUT_LANG = 'he',
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  NOTIFY_EMAIL,
} = process.env;

export const MERGE_MAX_TOKENS = 8192;

export const TMP_DIR = path.join(__dirname, '..', 'tmp');
mkdirSync(TMP_DIR, { recursive: true });
