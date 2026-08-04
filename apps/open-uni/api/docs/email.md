# Email Notifications

Sends Gmail notifications when new lectures are detected or when a summary is ready.

## API

- Module: `EmailModule`
- Service: `EmailService`
- Called automatically when `POST :classId/lectures/:lectureId/summarize` finishes successfully, and manually via `POST /api/classes/test-email`

**Triggers:**
- Summary email — sent right after a lecture's summarize job saves its result, gated by the `notifyEmailEnabled` toggle

**Config:** `GMAIL_*` env vars (see `.env.local`) for SMTP credentials. Recipient address is `GET/PUT /api/classes/notify-email`. The on/off toggle is `GET/PUT /api/classes/notify-email-enabled` (`{ enabled: boolean }`, defaults to off).

**Manual test:** `POST /api/classes/test-email` with `{ classId, lectureId }` — requires lecture to have a current summary. Ignores the toggle (always sends when called directly).

## Tests

Dispatch is covered with `EmailService` mocked — assertions only, never hits SMTP. `sendLectureSummary` is asserted on summarize completion when the toggle is on. It's fire-and-forget, so a rejected promise must not fail the summarize job. See [lectures.md](lectures.md).

## Web

- Settings page — "בדיקת שליחת מייל" section: pick any lecture with a summary and send a test email
- See [settings.md](../../open-uni-recorder-web/docs/settings.md)
