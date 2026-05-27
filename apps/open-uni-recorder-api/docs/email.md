# Email Notifications

Sends Gmail notifications when new lectures are detected or when a summary is ready.

## API

- Module: `EmailModule`
- Service: `EmailService`
- Called automatically by `PipelineService` and manually via `POST /api/classes/test-email`

**Triggers:**
- Detection email — sent after `runFullPipeline()` if new lectures were found
- Summary email — sent after each lecture completes processing in the queue

**Config:** `GMAIL_*` env vars (see `.env.local`). Recipient is configured in the same env.

**Manual test:** `POST /api/classes/test-email` with `{ classId, lectureId }` — requires lecture to have a current summary.

## Web

- Settings page — "בדיקת שליחת מייל" section: pick any lecture with a summary and send a test email
- See [settings.md](../../open-uni-recorder-web/docs/settings.md)
