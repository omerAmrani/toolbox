# Pipeline

Orchestrates the full detect → transcribe → summarize → email flow.

## API

- Module: `PipelineModule`
- Controller: `PipelineController` (`api/classes`)

Routes:
- `POST /api/classes/sync` (SSE) — detects new lectures and creates them immediately (`pending`); streams back what was created per class for display. Subject to the per-user job cap (`429` if the caller already has a transcribe/detect/sync job running — see [lectures.md](lectures.md)).
- `GET /api/classes/queue` — current queue state: `{ running, lectures[] }`
- `POST /api/classes/test-email` — send summary email for a specific lecture
- `GET/PUT /api/classes/notify-email` — email recipient for summary notifications; `JobsModule`
- `GET/PUT /api/classes/active-semester` — semester detection/sync scopes itself to; `JobsModule`

There is no automatic queue runner or cron. Detection (`sync`) and per-lecture transcribe/summarize (`LecturesController`, see [lectures.md](lectures.md)) are both triggered manually from the web app.

**Concurrency:** each user can have at most one active transcribe/detect/sync job at a time, enforced in-memory per user (`src/job-guard.ts`), guarding against one user's jobs overloading the server or getting the shared OPAL login IP throttled. Abort is per-lecture via `AbortController` map.

**Backends** from config: transcription via Groq Whisper API, `SUMMARIZE_BACKEND` (`gemini` | `claude`).

## Tests

Covers processes with no HTTP endpoint (run on a schedule or on boot):

- **Startup recovery** (`resetStuckProcessing()`, runs in `AppModule` on boot) — integration test against the real DB: a lecture stuck at `transcribing` is reset to `pending`, one stuck at `summarizing` is reset to `transcribed`, both with `lastError = 'Server restarted mid-job'`; a lecture with any status outside the known set (`pending`/`transcribing`/`transcribed`/`summarizing`/`summarized`) is reset to `pending` with `lastError = 'Unknown status: <value>'`; lectures in other known states are left untouched.
- **Email dispatch** — asserted with `EmailService` mocked (never hits SMTP): `sendLectureSummary` is called once on successful queue completion. A rejected email promise must not fail the run (fire-and-forget).
- **mp3 lifecycle** — a fake `audio.mp3` is placed on disk before each run; asserted deleted after successful transcription. When transcript is empty the mp3 must survive (lecture reverts to `pending` + `lastError`, mp3 available for retry on re-queue).
- **notify-email / active-semester CRUD** — covered in `test/jobs.spec.ts`.

See `open-uni-deployment.md` Phase 1 for the full test plan.

## Web

- Page: Settings (`/settings`) — sync panel (auto-adds detected lectures as `pending`)
- See [settings.md](../../open-uni-recorder-web/docs/settings.md)
