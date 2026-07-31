import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildPrompt, TRUNCATION_WARNING, SYSTEM_PROMPT } from './prompt';
import { MERGE_MAX_TOKENS, GEMINI_MODEL } from '../../../config';

function getModel(apiKey: string) {
  if (!apiKey) throw new Error('Gemini API key required for summarization');
  return new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: GEMINI_MODEL!, systemInstruction: SYSTEM_PROMPT });
}

export async function mergeSummaries(chunks: string[], apiKey: string, onProgress = (_: string) => {}, onToken: ((t: string) => void) | null = null): Promise<string> {
  const fullTranscript = chunks.join('\n\n');
  onProgress('מסכם עם Gemini...');

  const model = getModel(apiKey);

  if (onToken) {
    const result = await model.generateContentStream({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(fullTranscript) }] }],
      generationConfig: { maxOutputTokens: MERGE_MAX_TOKENS },
    });
    let full = '';
    for await (const chunk of result.stream) {
      const token = chunk.text();
      full += token;
      onToken(token);
    }
    const response = await result.response;
    if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
      const warning = TRUNCATION_WARNING;
      console.warn('[summarize] Gemini output truncated by token limit.');
      onToken(warning);
      full += warning;
    }
    return full;
  }

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: buildPrompt(fullTranscript) }] }],
    generationConfig: { maxOutputTokens: MERGE_MAX_TOKENS },
  });
  const response = result.response;
  if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    const warning = TRUNCATION_WARNING;
    console.warn('[summarize] Gemini output truncated by token limit.');
    return response.text() + warning;
  }
  return response.text();
}
