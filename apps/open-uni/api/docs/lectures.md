# Lectures

Lecture lifecycle management: CRUD, status machine, transcription and summarization SSE endpoints.

## API

- Module: `LecturesModule`
- Controller: `LecturesController` (`api/classes/:classId/lectures`)

**Ownership:** every route requires a valid `auth_token` session cookie (401 if missing/invalid) and 404s if the logged-in user doesn't own the parent class — see `docs/classes.md`. Checked once per request (`requireOwnedClass`) before any lecture lookup.

**CRUD routes:**
- `GET /api/classes/:classId/lectures` — list lectures for a class
- `POST /api/classes/:classId/lectures` — create lecture (`name`, `url` required; `lectureDate` optional). Always starts at `pending`.
- `PATCH /api/classes/:classId/lectures/:lectureId` — update `name` / `lectureDate`
- `GET /api/classes/:classId/lectures/:lectureId/status` — full lecture record

Lectures cannot be deleted individually — all lectures synced/detected for a class remain visible; only deleting the parent class removes them (see `docs/classes.md`).

**Status machine:**
`pending` → `transcribing` → `transcribed` → `summarizing` → `summarized`

Only these 5 statuses exist. A failure or user-abort during `transcribing`/`summarizing` doesn't move to a separate error status — it reverts to the state the lecture was in before that step started (`transcribing` → `pending`, `summarizing` → `transcribed`) and attaches `lastError` + `lastErrorAt`. The lecture is then retried simply by re-triggering the same action (transcribe/summarize) — there's no dedicated retry endpoint; a successful run clears `lastError`/`lastErrorAt`.

There is no `skipped` status — every lecture created (manually or via sync/cron detection) starts at `pending` and flows through the pipeline.

**Transcribe (SSE):** `POST .../transcribe`
- login to OPAL → extract video URL → download + ffmpeg → whisper → save `transcript.txt`
- Body: `{ opalUsername, opalPassword, opalId, groqApiKey }` required (400 if missing) — no server-side credential fallback, the client supplies its own per-request (see `docs/classes.md`'s OPAL credentials note)
- Body: `{ test: true }` caps download at 30 min
- A second client connecting to an in-progress job attaches to the existing bus (no duplicate job)
- Per-user concurrency cap: a user can only have one active transcribe/detect/sync job at a time (across all classes/lectures) — a second one returns `429` (`src/job-guard.ts`). This is separate from the "attach to existing bus" case above, which is a reconnect to the *same* job, not a second one.

**Summarize (SSE):** `POST .../summarize`
- reads `transcript.txt` → summarizes via backend → saves versioned summary → sets as current → if `notifyEmailEnabled` is on, sends the summary to the configured notify email (fire-and-forget, failure is logged and does not fail the job — see `docs/email.md`)
- Body: `{ backend: 'gemini' | 'claude' }` overrides config default; `{ geminiApiKey }` or `{ anthropicApiKey }` required to match whichever backend is used (400 if missing)

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
