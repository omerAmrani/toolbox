import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import Groq from 'groq-sdk';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Ollama } from 'ollama';

@Controller('api/health')
export class HealthController {
  @Get('groq')
  async checkGroq(@Res() res: Response) {
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
      const text = response.choices[0].message.content!.trim();
      res.json({ ok: true, configured: true, response: text, ms: Date.now() - t0 });
    } catch (err: any) {
      res.json({ ok: false, configured: true, error: err.message });
    }
  }

  @Get('gemini')
  async checkGemini(@Res() res: Response) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.json({ ok: false, configured: false, error: 'GEMINI_API_KEY not set in .env' });
    try {
      const t0 = Date.now();
      const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent('Reply with just the word "ok".');
      const text = result.response.text().trim();
      res.json({ ok: true, configured: true, response: text, ms: Date.now() - t0 });
    } catch (err: any) {
      res.json({ ok: false, configured: true, error: err.message });
    }
  }

  @Get('claude')
  async checkClaude(@Res() res: Response) {
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
      const text = (response.content[0] as any).text.trim();
      res.json({ ok: true, configured: true, response: text, ms: Date.now() - t0 });
    } catch (err: any) {
      res.json({ ok: false, configured: true, error: err.message });
    }
  }

  @Get('ollama')
  async checkOllama(@Res() res: Response) {
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
    } catch (err: any) {
      const notRunning = err.message?.includes('ECONNREFUSED') || err.message?.includes('fetch failed');
      res.json({ ok: false, configured: true, error: notRunning ? 'Ollama לא פועל' : err.message });
    }
  }
}
