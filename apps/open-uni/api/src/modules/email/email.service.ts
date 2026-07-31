import { Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { marked } from 'marked';
import { GMAIL_USER, GMAIL_APP_PASSWORD } from '../../config';

@Injectable()
export class EmailService {
  private formatDate(isoDate?: string | null): string | null {
    if (!isoDate) return null;
    const [year, month, day] = isoDate.split('-');
    if (!year || !month || !day) return null;
    return `${day}/${month}/${year}`;
  }

  private isConfigured(to?: string | null): to is string {
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !to) {
      console.log('[email] skipping — GMAIL_USER / GMAIL_APP_PASSWORD not configured, or no recipient set');
      return false;
    }
    return true;
  }

  private createTransporter() {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });
  }

  async sendMagicLink(to: string, verifyUrl: string): Promise<void> {
    if (!this.isConfigured(to)) throw new Error('Email is not configured — set GMAIL_USER / GMAIL_APP_PASSWORD');

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 15px; line-height: 1.7; color: #1a1a1a; max-width: 500px; margin: 0 auto; padding: 24px; direction: rtl; }
  a.btn { display: inline-block; margin-top: 16px; padding: 10px 20px; background: #2c2c2c; color: #fff; text-decoration: none; border-radius: 6px; }
  .footer { margin-top: 24px; font-size: 0.85em; color: #888; }
</style>
</head>
<body dir="rtl">
  <p>לחצו על הכפתור כדי להתחבר:</p>
  <a class="btn" href="${verifyUrl}">התחברות</a>
  <p class="footer">הקישור תקף ל-15 דקות. אם לא ביקשתם התחברות, אפשר להתעלם מהמייל.</p>
</body>
</html>`;

    await this.createTransporter().sendMail({
      from: GMAIL_USER,
      to,
      subject: 'קישור התחברות',
      html,
      text: `לחצו על הקישור כדי להתחבר: ${verifyUrl}\n\nהקישור תקף ל-15 דקות.`,
    });

    console.log(`[email] sent magic link to ${to}`);
  }

  async sendLectureSummary({ to, className, lectureName, lectureDate, summaryContent }: { to: string | null; className: string; lectureName: string; lectureDate?: string; summaryContent: string }): Promise<void> {
    if (!this.isConfigured(to)) return;

    const dateStr = this.formatDate(lectureDate) || this.formatDate(new Date().toISOString().slice(0, 10));
    const htmlBody = await marked(summaryContent);

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 15px; line-height: 1.7; color: #1a1a1a; max-width: 700px; margin: 0 auto; padding: 24px; direction: rtl; }
  h1, h2, h3 { color: #2c2c2c; }
  h2 { border-bottom: 1px solid #e0e0e0; padding-bottom: 6px; }
  code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
  pre { background: #f4f4f4; padding: 12px; border-radius: 6px; overflow-x: auto; }
  blockquote { border-right: 4px solid #d0d0d0; margin: 0; padding-right: 16px; color: #555; }
  .header { margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e0e0e0; color: #555; font-size: 0.9em; }
</style>
</head>
<body dir="rtl">
  <div class="header">${lectureName} &nbsp;·&nbsp; ${dateStr} &nbsp;·&nbsp; ${className}</div>
  ${htmlBody}
</body>
</html>`;

    await this.createTransporter().sendMail({
      from: GMAIL_USER,
      to,
      subject: `[${className}] — ${lectureName}, ${dateStr}`,
      html,
      text: summaryContent,
    });

    console.log(`[email] sent summary for "${lectureName}" to ${to}`);
  }
}
