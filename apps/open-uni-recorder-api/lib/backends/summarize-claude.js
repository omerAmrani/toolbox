import Anthropic from '@anthropic-ai/sdk';
import { buildPrompt, summarizeChunk } from './prompt.js';
import { MERGE_MAX_TOKENS } from '../config.js';

export { summarizeChunk };

const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';

function getClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set in .env');
  return new Anthropic({ apiKey: key });
}

export async function mergeSummaries(chunks, onProgress = () => {}, onToken = null) {
  const fullTranscript = chunks.join('\n\n');
  onProgress('מסכם עם Claude...');

  const client = getClient();

  if (onToken) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: MERGE_MAX_TOKENS,
      messages: [{ role: 'user', content: buildPrompt(fullTranscript) }],
    });
    let full = '';
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        const token = chunk.delta.text;
        full += token;
        onToken(token);
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'max_tokens') {
      const warning = '\n\n---\n⚠️ **סיכום קוצר עקב מגבלת אורך** — ייתכן שחלקים מהסוף נחתכו.';
      onToken(warning);
      full += warning;
    }
    return full;
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MERGE_MAX_TOKENS,
    messages: [{ role: 'user', content: buildPrompt(fullTranscript) }],
  });
  return response.content[0].text;
}
