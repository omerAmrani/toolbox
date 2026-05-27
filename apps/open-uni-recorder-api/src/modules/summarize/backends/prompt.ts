export const TRUNCATION_WARNING = '\n\n---\n⚠️ **סיכום קוצר עקב מגבלת אורך** — ייתכן שחלקים מהסוף נחתכו.';

export function buildPrompt(transcript: string): string {
  return `Always respond in Hebrew. Technical terms may remain in English.

Summarize the following lecture in chronological order, section by section as it was taught.
Your summary should be 2–3 pages long (roughly 1000–1500 words).

For each section use this format:
**[timestamp] Subject title**
- Sub-topic: 2–4 sentences covering the key idea. Bold any concept or term name the first time it appears, e.g. **רקורסיה**
- Example (if given): brief description of what it illustrates

Skip filler, repetition, and admin announcements.

Transcript:
${transcript}`;
}

export function summarizeChunk(chunkText: string): Promise<string> {
  return Promise.resolve(chunkText);
}
