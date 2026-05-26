import Groq from 'groq-sdk';
import { OUTPUT_LANG } from '../config.js';

const CHUNK_MODEL = process.env.GROQ_CHUNK_MODEL || 'llama-3.1-8b-instant';
const MERGE_MODEL = process.env.GROQ_MERGE_MODEL || 'llama-3.3-70b-versatile';

function getClient() {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set in .env');
  return new Groq({ apiKey: key });
}

function systemPrompt() {
  const lang = OUTPUT_LANG === 'he' ? 'Hebrew' : 'English';
  return `You are an expert academic summarizer. You MUST always respond in ${lang}. Never respond in any other language.`;
}

function buildChunkPrompt(transcript) {
  const summaryLang = OUTPUT_LANG === 'he' ? 'עברית' : 'English';
  return `אתה עוזר סטודנט המסכם הרצאות אקדמיות. סכם את תמלול ההרצאה הבא ב${summaryLang}.

כתוב סיכום מפורט. הסיכום צריך לכלול:

1. **נושאים מרכזיים** — פרט כל נושא שנדון עם הסבר מלא
2. **מושגים והגדרות** — כל מונח חשוב עם הגדרתו המדויקת
3. **דוגמאות** — כל דוגמה שהמרצה הביא, כולל הקשרה והסבר
4. **שאלות ששאלו** — שאלות שנשאלו במהלך ההרצאה ותשובותיהן
5. **טיעונים והסברים** — הסברים מפורטים של רעיונות מורכבים
6. **מסקנות** — נקודות מרכזיות לזכור לקראת הבחינה

לכל נקודה, ציין את חותמת הזמן הרלוונטית מהתמלול (חותמות זמן מופיעות כל 30 שניות, למשל: [00:05:30]).

תמלול:
${transcript}

כתוב סיכום תמציתי של עד 400 מילה בלבד. התמקד אך ורק בנקודות העיקריות של קטע זה. אל תחזור על מידע שכבר ידוע. אל תוסיף כותרות — רק פסקאות קצרות.`;
}

function buildMergePrompt(summaries) {
  const summaryLang = OUTPUT_LANG === 'he' ? 'עברית' : 'English';
  const combined = summaries.map((s, i) => `[חלק ${i + 1}]\n${s}`).join('\n\n---\n\n');
  return `להלן סיכומים של חלקים עוקבים מאותה הרצאה. צור סיכום מאוחד ומלא ב${summaryLang}.

בתחילת הסיכום, צור טבלת תוכן עם הנושאים המרכזיים וחותמות הזמן שלהם (מהסיכומים החלקיים).
לאחר מכן כתוב את הסיכום המפורט ללא חותמות זמן נוספות.

אל תשמיט דוגמאות, שאלות, או הגדרות.

${combined}`;
}

async function callGroq(text, { model, maxTokens, onToken = null } = {}) {
  const groq = getClient();
  const messages = [
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: text },
  ];

  if (onToken) {
    const stream = await groq.chat.completions.create({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.3,
      stream: true,
    });
    let full = '';
    let finishReason = null;
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || '';
      const fr = chunk.choices[0]?.finish_reason;
      if (fr) finishReason = fr;
      full += token;
      if (token) onToken(token);
    }
    if (finishReason === 'length') {
      const warning = '\n\n---\n⚠️ **סיכום קוצר עקב מגבלת אורך** — ייתכן שחלקים מהסוף נחתכו.';
      console.warn('[summarize] WARNING: output was truncated by token limit.');
      onToken(warning);
      full += warning;
    }
    return full;
  }

  const response = await groq.chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.3,
  });
  const choice = response.choices[0];
  if (choice.finish_reason === 'length') {
    const warning = '\n\n---\n⚠️ **סיכום קוצר עקב מגבלת אורך** — ייתכן שחלקים מהסוף נחתכו.';
    console.warn('[summarize] WARNING: output was truncated by token limit.');
    return choice.message.content + warning;
  }
  return choice.message.content;
}

// Hebrew tokenizes ~1 char per token in LLaMA. Leave headroom for prompt template + output.
const MAX_CHUNK_CHARS = 8000;

function splitText(text) {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const chunks = [];
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

export function summarizeChunk(chunkText) {
  return callGroq(buildChunkPrompt(chunkText), { model: CHUNK_MODEL, maxTokens: 600 });
}

export async function mergeSummaries(summaries, onProgress = () => {}, onToken = null) {
  // If a single large transcript was passed (e.g. from regenerate), split it first
  if (summaries.length === 1) {
    const parts = splitText(summaries[0]);
    if (parts.length > 1) {
      console.log(`[groq] transcript too large (${summaries[0].length} chars), splitting into ${parts.length} chunks`);
      let doneCount = 0;
      onProgress(`מסכם ${parts.length} קטעים במקביל...`);
      const jobs = parts.map((part) =>
        callGroq(buildChunkPrompt(part), { model: CHUNK_MODEL, maxTokens: 600 }).then((result) => {
          doneCount++;
          onProgress(`סוכמו ${doneCount} מתוך ${parts.length} קטעים...`);
          return result;
        })
      );
      summaries = await Promise.all(jobs);
    } else {
      onProgress('מסכם...');
      return callGroq(buildChunkPrompt(summaries[0]), { model: MERGE_MODEL, maxTokens: 8192, onToken });
    }
  }

  onProgress('מאחד את כל החלקים לסיכום מלא...');
  return callGroq(buildMergePrompt(summaries), { model: MERGE_MODEL, maxTokens: 8192, onToken });
}
