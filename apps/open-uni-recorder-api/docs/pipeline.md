# Pipeline

Two entry points, both in `PipelineService`:

**`runFullPipeline()`** — detect + queue:
1. For each class with `opalCourseUrl`: run `DetectService.detectNewLectures()` (Playwright, OPAL login)
2. Newly found lectures are inserted as `pending`
3. Sends detection email notification if any found
4. Then runs the queue (same as below)

**`runQueue()`** — processes `pending` lectures one by one:
1. Pick next `pending` lecture → set `processing`
2. Download + transcribe: `DownloadService.downloadAndTranscribe()` → saves `transcript.txt`
3. Summarize: `SummarizeService.mergeSummaries()` → saves summary version, sets current
4. Set status `done`, send summary email
5. On abort: status → `aborted`. On error: status → `failed`.

Only one queue runs at a time (`queueRunning` flag). Abort is per-lecture via `AbortController` map.

**Cron**: runs `runFullPipeline` every Thursday + Friday at 10:00 AM Jerusalem time (`0 10 * * 4,5 Asia/Jerusalem`). Log stored in `data/cron-log.json` (last 50 entries).

**Backends** used come from config: `WHISPER_BACKEND` (groq-whisper | whisper-cpp), `SUMMARIZE_BACKEND` (gemini | groq | claude | ollama).
