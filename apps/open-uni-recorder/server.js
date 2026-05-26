import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, readFileSync, existsSync } from 'fs';
import * as dotenv from 'dotenv';
import Groq from 'groq-sdk';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Ollama } from 'ollama';
import cron from 'node-cron';
import classesRouter from './src/routes/classes.js';
import { getLectures, CLASSES_DIR } from './src/storage.js';
import { resetStuckProcessing, runFullPipeline, logCronRun } from './lib/pipeline.js';
import { reloadFromDisk } from './src/migrate.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

// ── Root → classes ────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.redirect('/classes'));

// ── Classes pages ─────────────────────────────────────────────────────────────
app.get('/classes', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'classes.html')));
app.get('/classes/:classId', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'class-detail.html')));
app.get('/classes/:classId/lectures/:lectureId', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'lecture.html')));

app.use(express.static(path.join(__dirname, 'public')));

// ── Classes API ───────────────────────────────────────────────────────────────
app.use('/api/classes', classesRouter);

// ── Search ────────────────────────────────────────────────────────────────────
app.get('/api/search', (req, res) => {
  const { q, classId } = req.query;
  if (!q || q.trim().length < 2) return res.status(400).json({ error: 'q must be at least 2 chars' });
  const query = q.trim();
  const results = [];
  const classIds = classId
    ? [classId]
    : (existsSync(CLASSES_DIR)
        ? readdirSync(CLASSES_DIR, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name)
        : []);

  for (const cId of classIds) {
    for (const lecture of getLectures(cId)) {
      const tPath = path.join(CLASSES_DIR, cId, 'lectures', lecture.id, 'transcript.txt');
      if (!existsSync(tPath)) continue;
      const text = readFileSync(tPath, 'utf8');
      const idx = text.toLowerCase().indexOf(query.toLowerCase());
      if (idx === -1) continue;
      const snippet = text.slice(Math.max(0, idx - 100), idx + 200);
      results.push({ classId: cId, lectureId: lecture.id, lectureName: lecture.name, snippet });
    }
  }
  res.json(results);
});

// ── Health checks ─────────────────────────────────────────────────────────────
app.get('/settings', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'settings.html')));

app.get('/api/health/groq', async (_req, res) => {
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.json({ ok: false, configured: false, error: 'GROQ_API_KEY not set in .env' });
  try {
    const t0 = Date.now();
    const groq = new Groq({ apiKey: key });
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Reply with just the word "ok".' }],
    });
    const text = response.choices[0].message.content.trim();
    res.json({ ok: true, configured: true, response: text, ms: Date.now() - t0 });
  } catch (err) {
    res.json({ ok: false, configured: true, error: err.message });
  }
});

app.get('/api/health/gemini', async (_req, res) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.json({ ok: false, configured: false, error: 'GEMINI_API_KEY not set in .env' });
  try {
    const t0 = Date.now();
    const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent('Reply with just the word "ok".');
    const text = result.response.text().trim();
    res.json({ ok: true, configured: true, response: text, ms: Date.now() - t0 });
  } catch (err) {
    res.json({ ok: false, configured: true, error: err.message });
  }
});

app.get('/api/health/claude', async (_req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.json({ ok: false, configured: false, error: 'ANTHROPIC_API_KEY not set in .env' });
  try {
    const t0 = Date.now();
    const client = new Anthropic({ apiKey: key });
    const response = await client.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Reply with just the word "ok".' }],
    });
    const text = response.content[0].text.trim();
    res.json({ ok: true, configured: true, response: text, ms: Date.now() - t0 });
  } catch (err) {
    res.json({ ok: false, configured: true, error: err.message });
  }
});

app.get('/api/health/ollama', async (_req, res) => {
  const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  try {
    const t0 = Date.now();
    const ollama = new Ollama({ host });
    const model = process.env.OLLAMA_MODEL || 'llama3.2';
    const response = await ollama.chat({
      model,
      messages: [{ role: 'user', content: 'Reply with just the word "ok".' }],
      options: { num_predict: 10 },
    });
    const text = response.message.content.trim();
    res.json({ ok: true, configured: true, response: text, ms: Date.now() - t0, model });
  } catch (err) {
    const notRunning = err.message?.includes('ECONNREFUSED') || err.message?.includes('fetch failed');
    res.json({ ok: false, configured: true, error: notRunning ? 'Ollama לא פועל' : err.message });
  }
});


// ── Cron ──────────────────────────────────────────────────────────────────────

let retryTimer = null;

function clearRetry() {
  if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
}

async function cronRun(trigger = 'cron') {
  clearRetry();
  console.log(`[cron] running (${trigger})`);
  const { found, queued } = await runFullPipeline((msg) => console.log('[cron]', msg));
  logCronRun({ trigger, found, queued });

  if (found === 0) {
    retryTimer = setInterval(async () => {
      const hour = new Date().getHours();
      if (hour >= 18) { clearRetry(); return; }
      console.log('[cron] retry — nothing found earlier, checking again');
      const result = await runFullPipeline((msg) => console.log('[cron retry]', msg));
      logCronRun({ trigger: 'retry', found: result.found, queued: result.queued });
      if (result.found > 0) clearRetry();
    }, 30 * 60 * 1000);
  }
}

// Thursday (4) and Friday (5) at 10:00 AM Israel time
cron.schedule('0 10 * * 4,5', () => cronRun('cron'), { timezone: 'Asia/Jerusalem' });

app.post('/api/reload-from-disk', (_req, res) => {
  try {
    const result = reloadFromDisk();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n📚  Open University Summarizer`);
  console.log(`🌐  http://localhost:${PORT}\n`);
  resetStuckProcessing();
});
