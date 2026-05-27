import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import Groq from 'groq-sdk';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Ollama } from 'ollama';

interface HealthCheckResult {
  ok: boolean;
  configured: boolean;
  response?: string;
  error?: string;
  ms?: number;
  model?: string;
}

@Controller('api/health')
export class HealthController {
  private async check(
    envKey: string | undefined,
    envKeyName: string,
    run: () => Promise<{ response: string; extra?: Record<string, any> }>,
  ): Promise<HealthCheckResult> {
    if (!envKey) return { ok: false, configured: false, error: `${envKeyName} not set in .env` };
    try {
      const t0 = Date.now();
      const { response, extra } = await run();
      return { ok: true, configured: true, response, ms: Date.now() - t0, ...extra };
    } catch (err: any) {
      return { ok: false, configured: true, error: err.message };
    }
  }

  @Get('groq')
  async checkGroq(@Res() res: Response) {
    const key = process.env.GROQ_API_KEY;
    res.json(await this.check(key, 'GROQ_API_KEY', async () => {
      const groq = new Groq({ apiKey: key });
      const result = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Reply with just the word "ok".' }],
      });
      return { response: result.choices[0].message.content!.trim() };
    }));
  }

  @Get('gemini')
  async checkGemini(@Res() res: Response) {
    const key = process.env.GEMINI_API_KEY;
    res.json(await this.check(key, 'GEMINI_API_KEY', async () => {
      const model = new GoogleGenerativeAI(key!).getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent('Reply with just the word "ok".');
      return { response: result.response.text().trim() };
    }));
  }

  @Get('claude')
  async checkClaude(@Res() res: Response) {
    const key = process.env.ANTHROPIC_API_KEY;
    res.json(await this.check(key, 'ANTHROPIC_API_KEY', async () => {
      const client = new Anthropic({ apiKey: key });
      const response = await client.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Reply with just the word "ok".' }],
      });
      return { response: (response.content[0] as any).text.trim() };
    }));
  }

  @Get('ollama')
  async checkOllama(@Res() res: Response) {
    const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
    const model = process.env.OLLAMA_MODEL || 'llama3.2';
    const result = await this.check('configured', 'OLLAMA_HOST', async () => {
      const ollama = new Ollama({ host });
      const response = await ollama.chat({
        model,
        messages: [{ role: 'user', content: 'Reply with just the word "ok".' }],
        options: { num_predict: 10 },
      });
      return { response: response.message.content.trim(), extra: { model } };
    });
    if (!result.ok && result.error) {
      const notRunning = result.error.includes('ECONNREFUSED') || result.error.includes('fetch failed');
      result.error = notRunning ? 'Ollama לא פועל' : result.error;
    }
    res.json(result);
  }
}
