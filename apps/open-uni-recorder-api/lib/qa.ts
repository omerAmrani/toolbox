import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-4-5-20251001';

function getClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY לא מוגדר ב-.env');
  return new Anthropic({ apiKey: key });
}

export async function generateQuestions(summaryContent: string): Promise<string[]> {
  const client = getClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `אתה מורה המסכם הרצאה אקדמית. על סמך הסיכום הבא, צור 4-5 שאלות בעברית שיבחנו הבנה של החומר העיקרי.
החזר תשובה כ-JSON בלבד — מערך של מחרוזות, ללא טקסט נוסף.
דוגמה: ["שאלה 1?", "שאלה 2?"]

סיכום:
${summaryContent}`,
    }],
  });

  const text = (response.content[0] as any).text.trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('תגובת Claude לא תקינה — לא נמצא JSON');
  return JSON.parse(match[0]);
}

export async function evaluateAnswers(questions: string[], answers: string[]): Promise<{ correct: boolean; explanation: string }[]> {
  const client = getClient();
  const pairs = questions.map((q, i) =>
    `שאלה ${i + 1}: ${q}\nתשובת התלמיד: ${answers[i] || '(לא נענה)'}`
  ).join('\n\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `אתה מורה המעריך תשובות תלמיד. לכל שאלה ותשובה, קבע אם התשובה נכונה ותן הסבר קצר בעברית.
החזר JSON בלבד — מערך של אובייקטים, ללא טקסט נוסף.
דוגמה: [{"correct": true, "explanation": "..."}, {"correct": false, "explanation": "..."}]

${pairs}`,
    }],
  });

  const text = (response.content[0] as any).text.trim();
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('תגובת Claude לא תקינה — לא נמצא JSON');
  return JSON.parse(match[0]);
}
