# Lectures

Lecture lifecycle management: CRUD, status machine, transcription and summarization SSE endpoints, Q&A.

## API

- Module: `LecturesModule`
- Controller: `LecturesController` (`api/classes/:classId/lectures`)

**CRUD routes:**
- `GET /api/classes/:classId/lectures` — list lectures for a class
- `POST /api/classes/:classId/lectures` — create lecture (`name`, `url` required; `lectureDate` optional). Always starts at `pending`.
- `PATCH /api/classes/:classId/lectures/:lectureId` — update `name` / `lectureDate`
- `DELETE /api/classes/:classId/lectures/:lectureId` — delete lecture and all associated files
- `GET /api/classes/:classId/lectures/:lectureId/status` — full lecture record

**Status machine:**
`pending` → `transcribing` → `transcribed` → `summarizing` → `summarized`

Only these 5 statuses exist. A failure or user-abort during `transcribing`/`summarizing` doesn't move to a separate error status — it reverts to the state the lecture was in before that step started (`transcribing` → `pending`, `summarizing` → `transcribed`) and attaches `lastError` + `lastErrorAt`. The lecture is then retried simply by re-triggering the same action (transcribe/summarize) — there's no dedicated retry endpoint; a successful run clears `lastError`/`lastErrorAt`.

There is no `skipped` status — every lecture created (manually or via sync/cron detection) starts at `pending` and flows through the pipeline.

**Transcribe (SSE):** `POST .../transcribe`
- login to OPAL → extract video URL → download + ffmpeg → whisper → save `transcript.txt`
- Body: `{ test: true }` caps download at 30 min
- A second client connecting to an in-progress job attaches to the existing bus (no duplicate job)

**Summarize (SSE):** `POST .../summarize`
- reads `transcript.txt` → summarizes via backend → saves versioned summary → sets as current
- Body: `{ backend: 'gemini' | 'claude' }` overrides config default

**SSE event shapes:**
- `{ type: 'progress', step, message }`
- `{ type: 'token', token }` — streaming token during summarization
- `{ type: 'done' }`
- `{ type: 'error' | 'aborted', message }`

**Abort:** `POST .../abort` with `{ type: 'transcribe' | 'summarize' }`

**File routes:**
- `GET .../transcript` — raw `transcript.txt`
- `GET .../summary` — latest summary version's content (`lectures.currentSummary` always points at the newest surviving version — there's no manual "set current" anymore)
- `GET .../summaries` — list of all summary versions `{ versions[], currentSummary }`
- `GET .../summaries/:summaryId` — specific version content (read-only, does not change which version is latest)
- `DELETE .../summaries/:summaryId` — delete a version; if it was the latest, the next-newest remaining version becomes latest

## Web

- Pages: class detail (`/classes/[classId]`), lecture detail (`/classes/[classId]/lectures/[lectureId]`)
- See [lectures.md](../../open-uni-recorder-web/docs/lectures.md)
