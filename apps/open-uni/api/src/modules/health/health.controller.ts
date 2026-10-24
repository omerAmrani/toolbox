import { Controller, Get, Post, Res, HttpCode } from '@nestjs/common';
import { Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_MODEL, CLAUDE_MODEL, GEMINI_API_KEY, ANTHROPIC_API_KEY } from '../../config';

interface HealthCheckResult {
  ok: boolean;
  configured: boolean;
  response?: string;
  error?: string;
  ms?: number;
}

// Model checks use the keys from the API's .env (local mode, see
// docs/adr/0002 and docs/health.md).
@Controller('health')
export class HealthController {
  private async check(
    apiKey: string | undefined,
    run: (apiKey: string) => Promise<{ response: string }>,
  ): Promise<HealthCheckResult> {
    if (!apiKey) return { ok: false, configured: false, error: 'API key not set in apps/open-uni/api/.env' };
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
  async checkGemini(@Res() res: Response) {
    res.json(await this.check(GEMINI_API_KEY, async (key) => {
      const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: GEMINI_MODEL! });
      const result = await model.generateContent('Reply with just the word "ok".');
      return { response: result.response.text().trim() };
    }));
  }

  @Post('claude')
  @HttpCode(200)
  async checkClaude(@Res() res: Response) {
    res.json(await this.check(ANTHROPIC_API_KEY, async (key) => {
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
