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

## Tests

Dispatch is covered with `EmailService` mocked — assertions only, never hits SMTP. `sendLectureSummary` is asserted on queue completion and `sendDetectionNotification` when detection finds new lectures (and not when it finds none). Both are fire-and-forget, so a rejected promise must not fail the pipeline run. See [pipeline.md](pipeline.md#tests) and `open-uni-deployment.md` Phase 1.

## Web

- Settings page — "בדיקת שליחת מייל" section: pick any lecture with a summary and send a test email
- See [settings.md](../../open-uni-recorder-web/docs/settings.md)
