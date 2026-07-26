# Pipeline

Orchestrates the full detect → transcribe → summarize → email flow.

## API

- Module: `PipelineModule`
- Controller: `PipelineController` (`api/classes`)

Routes:
- `POST /api/classes/run-queue` — process all pending lectures one by one
- `POST /api/classes/run-pipeline` — detect new lectures from OPAL, then run the queue
- `POST /api/classes/sync` (SSE) — detects new lectures and creates them immediately (`pending`); streams back what was created per class for display
- `GET /api/classes/queue` — current queue state: `{ running, lectures[] }`
- `GET /api/classes/cron-log` — last cron run entry
- `POST /api/classes/test-email` — send summary email for a specific lecture
- `GET/PUT /api/classes/cron-schedule` — cron's weekday/time schedule (`{ days: number[0-6], hour, minute }`) + computed `nextRun`; `JobsModule`
- `GET/PUT /api/classes/notify-email` — email recipient for detection/summary notifications; `JobsModule`
- `GET/PUT /api/classes/active-semester` — semester `runFullPipeline` scopes itself to; `JobsModule`

**`runQueue()` flow:**
1. Pick next `pending` lecture → set `transcribing`
2. `DownloadService.downloadAndTranscribe()` — downloads HLS, chunks audio, transcribes via Whisper, saves `audio.mp3` as a side-effect
3. Guard: transcript must be non-empty **before** writing to disk; throws → reverts to `pending` + `lastError`, mp3 preserved for retry
4. Write `transcript.txt`, delete `audio.mp3`, checkpoint status → `transcribed` (clears any prior `lastError`)
5. Set status `summarizing` → `SummarizeService.mergeSummaries()` → saves summary version, sets current
6. Set status `summarized`, send summary email
7. On failure/abort during transcribe: revert to `pending` + `lastError`. During summarize: revert to `transcribed` + `lastError`. Abort message is distinguished from a real error via the `lastError` text.

**Chunk error propagation:** if any Whisper chunk fails inside `downloadAndTranscribe`, remaining pending chunks are skipped and the error is thrown — pipeline catches it, lecture reverts to `pending` + `lastError`.

**`runFullPipeline()` flow:**
1. For each class with `opalCourseUrl` matching the stored active semester (`getActiveSemester()` — unset means every semester): run `DetectService.detectNewLectures()` (Playwright, OPAL login)
2. Newly found lectures inserted as `pending`
3. Sends detection email (to the stored `notifyEmail`, skipped if unset) if any found
4. Does **not** run the queue itself — pending lectures are processed separately (per-lecture action on the class page). Nothing currently calls `run-queue` automatically, cron included.

**Cron:** schedule is stored in `app_settings` (`cronSchedule`, default Thu+Fri 10:00 `Asia/Jerusalem`), editable via `/api/classes/cron-schedule` from Settings. `JobsService` registers/replaces a live `CronJob` through `@nestjs/schedule`'s `SchedulerRegistry` at boot and on every update — changes apply immediately, no restart needed. Log stored in `data/cron-log.json` (last 50 entries).

**Concurrency:** only one queue runs at a time (`queueRunning` flag). Abort is per-lecture via `AbortController` map.

**Backends** from config: transcription via Groq Whisper API, `SUMMARIZE_BACKEND` (`gemini` | `claude`).

## Tests

Covers processes with no HTTP endpoint (run on a schedule or on boot):

- **Startup recovery** (`resetStuckProcessing()`, runs in `AppModule` on boot) — integration test against the real DB: a lecture stuck at `transcribing` is reset to `pending`, one stuck at `summarizing` is reset to `transcribed`, both with `lastError = 'Server restarted mid-job'`; a lecture with any status outside the known set (`pending`/`transcribing`/`transcribed`/`summarizing`/`summarized`) is reset to `pending` with `lastError = 'Unknown status: <value>'`; lectures in other known states are left untouched.
- **Email dispatch** — asserted with `EmailService` mocked (never hits SMTP): `sendLectureSummary` is called once on successful `runQueue` completion; `sendDetectionNotification` is called once when `runFullPipeline` detects new lectures and not at all when none are found. A rejected email promise must not fail the run (fire-and-forget).
- **mp3 lifecycle** — a fake `audio.mp3` is placed on disk before each run; asserted deleted after successful transcription. When transcript is empty the mp3 must survive (lecture reverts to `pending` + `lastError`, mp3 available for retry on re-queue).
- **Cron scheduler** (`JobsService`'s dynamic `CronJob` + 30-min retry loop) — **intentionally not tested.** Treated as infra; its core work (`runFullPipeline`) is covered via the `run-pipeline` endpoint. Schedule/email/active-semester CRUD is covered in `test/jobs.spec.ts`. Known coverage gap on the retry-loop timer itself.

See `open-uni-deployment.md` Phase 1 for the full test plan.

## Web

- Page: Settings (`/settings`) — sync panel (auto-adds detected lectures as `pending`), cron log display
- See [settings.md](../../open-uni-recorder-web/docs/settings.md)
