# Pipeline

Orchestrates the full detect → transcribe → summarize → email flow.

## API

- Module: `PipelineModule`
- Controller: `PipelineController` (`api/classes`)

Routes:
- `POST /api/classes/run-queue` — process all pending lectures one by one
- `POST /api/classes/run-pipeline` — detect new lectures from OPAL, then run the queue
- `POST /api/classes/sync` (SSE) — detect-only, returns new lectures without queuing them
- `GET /api/classes/queue` — current queue state: `{ running, lectures[] }`
- `GET /api/classes/cron-log` — last cron run entry
- `POST /api/classes/test-email` — send summary email for a specific lecture

**`runQueue()` flow:**
1. Pick next `pending` lecture → set `processing`
2. `DownloadService.downloadAndTranscribe()` — downloads HLS, chunks audio, transcribes via Whisper, saves `audio.mp3` as a side-effect
3. Guard: transcript must be non-empty **before** writing to disk; throws → status `failed`, mp3 preserved for retry
4. Write `transcript.txt`, then delete `audio.mp3` (mp3 has no downstream use once transcript exists)
5. `SummarizeService.mergeSummaries()` → saves summary version, sets current
6. Set status `done`, send summary email
7. On abort: status → `aborted`. On error: status → `failed`.

**Chunk error propagation:** if any Whisper chunk fails inside `downloadAndTranscribe`, remaining pending chunks are skipped and the error is thrown — pipeline catches it, lecture → `failed`.

**`runFullPipeline()` flow:**
1. For each class with `opalCourseUrl`: run `DetectService.detectNewLectures()` (Playwright, OPAL login)
2. Newly found lectures inserted as `pending`
3. Sends detection email if any found
4. Runs the queue (same as above)

**Cron:** `0 10 * * 4,5 Asia/Jerusalem` (Thu + Fri 10:00 AM). Log stored in `data/cron-log.json` (last 50 entries).

**Concurrency:** only one queue runs at a time (`queueRunning` flag). Abort is per-lecture via `AbortController` map.

**Backends** from config: transcription via Groq Whisper API, `SUMMARIZE_BACKEND` (`gemini` | `claude`).

## Tests

Covers processes with no HTTP endpoint (run on a schedule or on boot):

- **Startup recovery** (`resetStuckProcessing()`, runs in `AppModule` on boot) — integration test against the real DB: a lecture in `processing` is reset to `failed` with `lastError = 'Server restarted mid-job'`; lectures in other states are left untouched.
- **Email dispatch** — asserted with `EmailService` mocked (never hits SMTP): `sendLectureSummary` is called once on successful `runQueue` completion; `sendDetectionNotification` is called once when `runFullPipeline` detects new lectures and not at all when none are found. A rejected email promise must not fail the run (fire-and-forget).
- **mp3 lifecycle** — a fake `audio.mp3` is placed on disk before each run; asserted deleted after successful transcription. When transcript is empty the mp3 must survive (lecture → `failed`, mp3 available for retry on re-queue).
- **Cron scheduler** (`JobsService` `@Cron('0 10 * * 4,5')` + 30-min retry loop) — **intentionally not tested.** Treated as infra; its core work (`runFullPipeline`) is covered via the `run-pipeline` endpoint. Known coverage gap.

See `open-uni-deployment.md` Phase 1 for the full test plan.

## Web

- Page: Settings (`/settings`) — queue panel, cron trigger, sync panel
- See [settings.md](../../open-uni-recorder-web/docs/settings.md)
