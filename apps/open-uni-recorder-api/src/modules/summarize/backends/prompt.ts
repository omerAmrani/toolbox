export const TRUNCATION_WARNING = '\n\n---\n⚠️ **סיכום קוצר עקב מגבלת אורך** — ייתכן שחלקים מהסוף נחתכו.';

export function buildPrompt(transcript: string): string {
  return `Always respond in Hebrew. Technical terms may remain in English.

You are an academic lecture summarizer for a student. Summarize the following lecture transcript fully and thoroughly — do not cut content short.

The summary must include these sections:

1. **נושאים מרכזיים** — each topic covered with a clear explanation
2. **מושגים והגדרות** — every important term with its exact definition
3. **דוגמאות** — examples the lecturer gave, with context
4. **מסקנות** — key points to remember for the exam

For each point, cite the relevant timestamp from the transcript. Timestamps appear every minute in [HH:MM] format (e.g. [00:05]).

Transcript:
${transcript}`;
}

export function summarizeChunk(chunkText: string): Promise<string> {
  return Promise.resolve(chunkText);
}
