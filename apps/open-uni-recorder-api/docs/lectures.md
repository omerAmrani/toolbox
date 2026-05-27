# Lectures

Lecture lifecycle management: CRUD, status machine, transcription and summarization SSE endpoints, Q&A.

## API

- Module: `LecturesModule`
- Controller: `LecturesController` (`api/classes/:classId/lectures`)

**CRUD routes:**
- `GET /api/classes/:classId/lectures` — list lectures for a class
- `POST /api/classes/:classId/lectures` — create lecture (`name`, `url` required; `lectureDate`, `status` optional — only `pending`/`skipped` accepted)
- `PATCH /api/classes/:classId/lectures/:lectureId` — update `name` / `lectureDate`
- `DELETE /api/classes/:classId/lectures/:lectureId` — delete lecture and all associated files
- `GET /api/classes/:classId/lectures/:lectureId/status` — full lecture record

**Status machine:**
`pending` → `transcribing` → `transcribed` → `summarizing` → `summarized` → `done`

Also: `failed`, `aborted`, `skipped`, `error`. Retry resets `failed` → `pending`.

**Lifecycle routes:**
- `POST .../retry` — `failed` → `pending`
- `POST .../skip` — `pending` → `skipped`
- `POST .../unskip` — `skipped` → `pending`

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
- `GET .../summary` — current summary content
- `GET .../summaries` — list of all summary versions `{ versions[], currentSummary }`
- `GET .../summaries/:summaryId` — specific version content
- `PUT .../summaries/:summaryId/current` — set active version
- `DELETE .../summaries/:summaryId` — delete a version

## Web

- Pages: class detail (`/classes/[classId]`), lecture detail (`/classes/[classId]/lectures/[lectureId]`)
- See [lectures.md](../../open-uni-recorder-web/docs/lectures.md)
