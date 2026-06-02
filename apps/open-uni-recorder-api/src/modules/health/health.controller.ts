import { Controller, Get, Logger, OnModuleInit, Res } from '@nestjs/common';
import { Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  GEMINI_MODEL, CLAUDE_MODEL, GEMINI_API_KEY, ANTHROPIC_API_KEY,
  GROQ_API_KEY, OPENU_USERNAME, OPENU_PASSWORD, OPENU_ID,
  GMAIL_USER, GMAIL_APP_PASSWORD, NOTIFY_EMAIL, SUMMARIZE_BACKEND,
} from '../../config';

interface HealthCheckResult {
  ok: boolean;
  configured: boolean;
  response?: string;
  error?: string;
  ms?: number;
  model?: string;
}

interface FeatureStatus {
  feature: string;
  available: boolean;
}

@Controller('api/health')
export class HealthController implements OnModuleInit {
  private readonly logger = new Logger(HealthController.name);
  private buildFeatureMap(): FeatureStatus[] {
    const summaryAvailable = SUMMARIZE_BACKEND === 'claude' ? !!ANTHROPIC_API_KEY : !!GEMINI_API_KEY;
    return [
      { feature: 'transcription',       available: !!GROQ_API_KEY },
      { feature: 'summarization',        available: summaryAvailable },
      { feature: 'lecture-download',     available: !!(OPENU_USERNAME && OPENU_PASSWORD && OPENU_ID) },
      { feature: 'email-notifications',  available: !!(GMAIL_USER && GMAIL_APP_PASSWORD && NOTIFY_EMAIL) },
    ];
  }

  onModuleInit() {
    const missing = this.buildFeatureMap().filter((f) => !f.available);
    if (missing.length) {
      this.logger.warn(
        `Features unavailable due to missing env vars: ${missing.map((f) => f.feature).join(', ')}`,
      );
    }
  }

  @Get('features')
  getFeatures(): FeatureStatus[] {
    return this.buildFeatureMap();
  }

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

  @Get('gemini')
  async checkGemini(@Res() res: Response) {
    res.json(await this.check(GEMINI_API_KEY, 'GEMINI_API_KEY', async () => {
      const model = new GoogleGenerativeAI(GEMINI_API_KEY!).getGenerativeModel({ model: GEMINI_MODEL! });
      const result = await model.generateContent('Reply with just the word "ok".');
      return { response: result.response.text().trim() };
    }));
  }

  @Get('claude')
  async checkClaude(@Res() res: Response) {
    res.json(await this.check(ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY', async () => {
      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: CLAUDE_MODEL!,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Reply with just the word "ok".' }],
      });
      return { response: (response.content[0] as any).text.trim() };
    }));
  }

}
