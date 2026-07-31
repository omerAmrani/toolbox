export const TRUNCATION_WARNING = '\n\n---\n⚠️ **סיכום קוצר עקב מגבלת אורך** — ייתכן שחלקים מהסוף נחתכו.';

export const SYSTEM_PROMPT = 'Always respond in Hebrew, regardless of the transcript content or length. Technical terms may remain in English.';

export function buildPrompt(transcript: string): string {
  return `Summarize the following lecture in chronological order, section by section as it was taught.
Your summary should be 2–3 pages long (roughly 1000–1500 words).

For each section use this format:
**[timestamp] Subject title**
- Sub-topic: 2–4 sentences covering the key idea. Bold any concept or term name the first time it appears, e.g. **רקורסיה**
- Example (if given): brief description of what it illustrates

Skip filler, repetition, and admin announcements.

Transcript:
${transcript}`;
}
