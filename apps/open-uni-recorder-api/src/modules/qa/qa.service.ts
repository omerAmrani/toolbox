import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY, CLAUDE_MODEL } from '../../config';

@Injectable()
export class QaService {
  private getClient(): Anthropic {
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY לא מוגדר ב-.env');
    return new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  }

  async generateQuestions(summaryContent: string): Promise<string[]> {
    const client = this.getClient();
    const response = await client.messages.create({
      model: CLAUDE_MODEL!,
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

  async evaluateAnswers(questions: string[], answers: string[]): Promise<{ correct: boolean; explanation: string }[]> {
    const client = this.getClient();
    const pairs = questions.map((q, i) =>
      `שאלה ${i + 1}: ${q}\nתשובת התלמיד: ${answers[i] || '(לא נענה)'}`
    ).join('\n\n');

    const response = await client.messages.create({
      model: CLAUDE_MODEL!,
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
}
