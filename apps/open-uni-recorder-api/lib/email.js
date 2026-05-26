import nodemailer from 'nodemailer';
import { marked } from 'marked';
import { GMAIL_USER, GMAIL_APP_PASSWORD, NOTIFY_EMAIL } from './config.js';

function formatDate(isoDate) {
  if (!isoDate) return null;
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day) return null;
  return `${day}/${month}/${year}`;
}

function isConfigured() {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !NOTIFY_EMAIL) {
    console.log('[email] skipping — GMAIL_USER / GMAIL_APP_PASSWORD / NOTIFY_EMAIL not configured');
    return false;
  }
  return true;
}

function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
}

export async function sendDetectionNotification(found) {
  if (!isConfigured()) return;

  const rows = found.map(l => {
    const date = formatDate(l.lectureDate) || '—';
    return `<tr><td style="padding:6px 12px">${l.className}</td><td style="padding:6px 12px">${l.lectureName}</td><td style="padding:6px 12px">${date}</td></tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 15px; line-height: 1.7; color: #1a1a1a; max-width: 700px; margin: 0 auto; padding: 24px; direction: rtl; }
  h2 { color: #2c2c2c; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f4f4f4; padding: 8px 12px; text-align: right; font-weight: 600; }
  td { border-top: 1px solid #e0e0e0; }
  .footer { margin-top: 24px; font-size: 0.85em; color: #888; }
</style>
</head>
<body dir="rtl">
  <h2>נמצאו ${found.length} הרצאות חדשות</h2>
  <table>
    <thead><tr><th>קורס</th><th>הרצאה</th><th>תאריך</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="footer">פתח את ההגדרות כדי לאשר או לדלג על הרצאות.</p>
</body>
</html>`;

  const text = `נמצאו ${found.length} הרצאות חדשות:\n` +
    found.map(l => `• ${l.className} — ${l.lectureName} (${formatDate(l.lectureDate) || '—'})`).join('\n') +
    '\n\nפתח את ההגדרות כדי לאשר או לדלג.';

  await createTransporter().sendMail({
    from: GMAIL_USER,
    to: NOTIFY_EMAIL,
    subject: `[פייפליין] נמצאו ${found.length} הרצאות חדשות`,
    html,
    text,
  });

  console.log(`[email] sent detection notification — ${found.length} lectures`);
}

export async function sendLectureSummary({ className, lectureName, lectureDate, summaryContent }) {
  if (!isConfigured()) return;

  const dateStr = formatDate(lectureDate) || formatDate(new Date().toISOString().slice(0, 10));

  const transporter = createTransporter();

  const htmlBody = marked(summaryContent);
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

  await transporter.sendMail({
    from: GMAIL_USER,
    to: NOTIFY_EMAIL,
    subject: `[${className}] — ${lectureName}, ${dateStr}`,
    html,
    text: summaryContent,
  });

  console.log(`[email] sent summary for "${lectureName}" to ${NOTIFY_EMAIL}`);
}
