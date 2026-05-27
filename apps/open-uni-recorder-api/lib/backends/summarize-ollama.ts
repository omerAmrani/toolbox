import { Ollama } from 'ollama';
import { OUTPUT_LANG } from '../config';

const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:14b';
const ollama = new Ollama({ host: 'http://localhost:11434' });

const LANG_NAME = OUTPUT_LANG === 'he' ? 'Hebrew' : 'English';
const LANG_HE   = OUTPUT_LANG === 'he' ? 'עברית'  : 'English';

function systemPrompt(): string {
  return `You are an expert academic summarizer. CRITICAL INSTRUCTION: You MUST write EVERY response exclusively in ${LANG_NAME}. Do NOT use Chinese, Mandarin, or any other language under any circumstances. If you write in any language other than ${LANG_NAME} you have failed your task.`;
}

function buildChunkPrompt(transcript: string): string {
  return `IMPORTANT: Your response MUST be written entirely in ${LANG_NAME}. Do not use Chinese or any other language.

סכם בקצרה את קטע ההרצאה הבא ב${LANG_HE}. כתוב עד 300 מילה בלבד.

כלול:
- נושאים שנדונו
- מושגים/הגדרות חשובים
- דוגמאות שהוזכרו
- חותמות זמן רלוונטיות [HH:MM:SS]

תמלול:
${transcript}

כתוב את הסיכום עכשיו ב${LANG_HE} בלבד:`;
}

function buildMergePrompt(summaries: string[]): string {
  const combined = summaries.map((s, i) => `[חלק ${i + 1}]\n${s}`).join('\n\n---\n\n');
  return `IMPORTANT: Your response MUST be written entirely in ${LANG_NAME}. Do not use Chinese or any other language.

להלן סיכומי ביניים של חלקים עוקבים מאותה הרצאה. צור סיכום מאוחד ומפורט ב${LANG_HE}.

הסיכום צריך לכלול:
1. **נושאים מרכזיים** — עם הסבר מלא לכל נושא
2. **מושגים והגדרות** — כל מונח חשוב עם הגדרתו
3. **דוגמאות** — כל דוגמה שהמרצה הביא
4. **שאלות ותשובות** — שאלות שנשאלו ותשובותיהן
5. **מסקנות** — נקודות מרכזיות לקראת הבחינה

שמור על חותמות הזמן. אל תשמיט פרטים חשובים.

${combined}

כתוב את הסיכום המאוחד עכשיו ב${LANG_HE} בלבד:`;
}

async function callOllama(text: string, { onToken = null, maxTokens = 4096 }: { onToken?: ((t: string) => void) | null; maxTokens?: number } = {}): Promise<string> {
  const messages: any[] = [
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: text },
  ];
  const options = { num_ctx: 32768, temperature: 0.3, num_predict: maxTokens };

  if (onToken) {
    const stream = await ollama.chat({ model: MODEL, messages, options, stream: true });
    let full = '';
    let doneReason: string | null = null;
    for await (const part of stream) {
      const token = part.message.content;
      full += token;
      onToken(token);
      if (part.done) doneReason = (part as any).done_reason;
    }
    if (doneReason === 'length') {
      const warning = '\n\n---\n⚠️ **סיכום קוצר עקב מגבלת אורך** — ייתכן שחלקים מהסוף נחתכו.';
      console.warn('[ollama] output truncated by token limit.');
      onToken(warning);
      full += warning;
    }
    return full;
  }

  const response = await ollama.chat({ model: MODEL, messages, options });
  if ((response as any).done_reason === 'length') {
    const warning = '\n\n---\n⚠️ **סיכום קוצר עקב מגבלת אורך** — ייתכן שחלקים מהסוף נחתכו.';
    console.warn('[ollama] output truncated by token limit.');
    return response.message.content + warning;
  }
  return response.message.content;
}

const MAX_CHUNK_CHARS = 8000;

function splitText(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = i + MAX_CHUNK_CHARS;
    if (end < text.length) {
      const nl = text.lastIndexOf('\n', end);
      if (nl > i) end = nl + 1;
    }
    chunks.push(text.slice(i, end));
    i = end;
  }
  return chunks;
}

export function summarizeChunk(chunkText: string): Promise<string> {
  return callOllama(buildChunkPrompt(chunkText), { maxTokens: 600 });
}

export async function mergeSummaries(summaries: string[], onProgress = (_: string) => {}, onToken: ((t: string) => void) | null = null): Promise<string> {
  if (summaries.length === 1) {
    const parts = splitText(summaries[0]);
    if (parts.length > 1) {
      console.log(`[ollama] splitting ${summaries[0].length} chars into ${parts.length} chunks`);
      const chunkSummaries: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        onProgress(`מסכם חלק ${i + 1} מתוך ${parts.length}...`);
        console.log(`[ollama] chunk ${i + 1}/${parts.length} (${parts[i].length} chars)`);
        chunkSummaries.push(await callOllama(buildChunkPrompt(parts[i]), { maxTokens: 600 }));
      }
      summaries = chunkSummaries;
    } else {
      console.log(`[ollama] single chunk (${summaries[0].length} chars)`);
      onProgress(`מסכם עם ${MODEL}...`);
      return callOllama(buildChunkPrompt(summaries[0]), { onToken, maxTokens: 4096 });
    }
  }

  console.log(`[ollama] merging ${summaries.length} chunk summaries`);
  onProgress('מאחד את כל החלקים לסיכום מלא...');
  return callOllama(buildMergePrompt(summaries), { onToken, maxTokens: 4096 });
}
