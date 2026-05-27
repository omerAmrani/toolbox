import Anthropic from '@anthropic-ai/sdk';
import { buildPrompt, summarizeChunk, TRUNCATION_WARNING } from './prompt';
import { MERGE_MAX_TOKENS, CLAUDE_MODEL, ANTHROPIC_API_KEY } from '../../../config';

export { summarizeChunk };

function getClient(): Anthropic {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set in .env');
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}

export async function mergeSummaries(chunks: string[], onProgress = (_: string) => {}, onToken: ((t: string) => void) | null = null): Promise<string> {
  const fullTranscript = chunks.join('\n\n');
  onProgress('מסכם עם Claude...');

  const client = getClient();

  if (onToken) {
    const stream = client.messages.stream({
      model: CLAUDE_MODEL!,
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
      onToken(TRUNCATION_WARNING);
      full += TRUNCATION_WARNING;
    }
    return full;
  }

  const response = await client.messages.create({
    model: CLAUDE_MODEL!,
    max_tokens: MERGE_MAX_TOKENS,
    messages: [{ role: 'user', content: buildPrompt(fullTranscript) }],
  });
  return (response.content[0] as any).text;
}
