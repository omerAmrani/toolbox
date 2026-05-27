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
2. `DownloadService.downloadAndTranscribe()` → saves `transcript.txt`
3. `SummarizeService.mergeSummaries()` → saves summary version, sets current
4. Set status `done`, send summary email
5. On abort: status → `aborted`. On error: status → `failed`.

**`runFullPipeline()` flow:**
1. For each class with `opalCourseUrl`: run `DetectService.detectNewLectures()` (Playwright, OPAL login)
2. Newly found lectures inserted as `pending`
3. Sends detection email if any found
4. Runs the queue (same as above)

**Cron:** `0 10 * * 4,5 Asia/Jerusalem` (Thu + Fri 10:00 AM). Log stored in `data/cron-log.json` (last 50 entries).

**Concurrency:** only one queue runs at a time (`queueRunning` flag). Abort is per-lecture via `AbortController` map.

**Backends** from config: `WHISPER_BACKEND` (`groq-whisper` | `whisper-cpp`), `SUMMARIZE_BACKEND` (`gemini` | `groq` | `claude` | `ollama`).

## Web

- Page: Settings (`/settings`) — queue panel, cron trigger, sync panel
- See [settings.md](../../open-uni-recorder-web/docs/settings.md)
