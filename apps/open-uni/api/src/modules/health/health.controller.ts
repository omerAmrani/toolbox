import { Controller, Get, Post, Body, Res, HttpCode } from '@nestjs/common';
import { Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_MODEL, CLAUDE_MODEL } from '../../config';

interface HealthCheckResult {
  ok: boolean;
  configured: boolean;
  response?: string;
  error?: string;
  ms?: number;
}

// Credential-dependent checks (Gemini/Claude/OpenU/email) used to read from
// server-side settings.json — that store is gone now that credentials are
// per-user and client-side only. The settings page sends the key it holds
// locally with each check instead (see docs/health.md).
@Controller('health')
export class HealthController {
  private async check(
    apiKey: string | undefined,
    run: (apiKey: string) => Promise<{ response: string }>,
  ): Promise<HealthCheckResult> {
    if (!apiKey) return { ok: false, configured: false, error: 'API key not provided' };
    try {
      const t0 = Date.now();
      const { response } = await run(apiKey);
      return { ok: true, configured: true, response, ms: Date.now() - t0 };
    } catch (err: any) {
      return { ok: false, configured: true, error: err.message };
    }
  }

  @Get('ping')
  ping(): { ok: true } {
    return { ok: true };
  }

  @Post('gemini')
  @HttpCode(200)
  async checkGemini(@Body('apiKey') apiKey: string, @Res() res: Response) {
    res.json(await this.check(apiKey, async (key) => {
      const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: GEMINI_MODEL! });
      const result = await model.generateContent('Reply with just the word "ok".');
      return { response: result.response.text().trim() };
    }));
  }

  @Post('claude')
  @HttpCode(200)
  async checkClaude(@Body('apiKey') apiKey: string, @Res() res: Response) {
    res.json(await this.check(apiKey, async (key) => {
      const client = new Anthropic({ apiKey: key });
      const response = await client.messages.create({
        model: CLAUDE_MODEL!,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Reply with just the word "ok".' }],
      });
      return { response: (response.content[0] as any).text.trim() };
    }));
  }
}
