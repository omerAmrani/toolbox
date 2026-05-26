import Groq from 'groq-sdk';
import fs from 'fs';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const WHISPER_PROMPT = process.env.WHISPER_PROMPT ||
  'הרצאה אקדמית. עשוי להכיל מונחים טכניים באנגלית.';

async function waitMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function transcribe(audioPath, retries = 5) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const fileStream = fs.createReadStream(audioPath);
      const transcription = await groq.audio.transcriptions.create({
        file: fileStream,
        model: 'whisper-large-v3-turbo',
        language: 'he',
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
        temperature: 0.0,
        prompt: WHISPER_PROMPT,
      });

      const segments = (transcription.segments || []).map(seg => ({
        startSec: seg.start,
        text: seg.text.trim(),
      }));

      const text = segments.map(s => s.text).join(' ');
      return { text, segments };

    } catch (err) {
      const isRateLimit = err?.status === 429 || err?.message?.includes('429');
      if (isRateLimit && attempt < retries) {
        const retryAfter = parseInt(err?.headers?.['retry-after'] || '0', 10);
        const waitTime = retryAfter > 0 ? retryAfter * 1000 : Math.pow(2, attempt) * 5000;
        console.warn(`[groq-whisper] Rate limited. Waiting ${waitTime / 1000}s before retry ${attempt + 1}/${retries}...`);
        await waitMs(waitTime);
        continue;
      }
      throw err;
    }
  }
}
