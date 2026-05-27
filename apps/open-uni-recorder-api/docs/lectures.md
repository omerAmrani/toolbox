# Lectures

## Statuses

`pending` → `transcribing` → `transcribed` → `summarizing` → `summarized` → `done`

Can also be: `failed`, `aborted`, `skipped`, `error`. Retry resets `failed` → `pending`.

## SSE endpoints

Both stream `text/event-stream`. A second client connecting to an already-running transcribe job attaches to the existing bus (no duplicate job).

**POST `/api/classes/:classId/lectures/:lectureId/transcribe`**
Flow: login to OPAL → extract video URL → download + ffmpeg → whisper transcription → save `transcript.txt`
Optional body: `{ test: true }` caps download at 30 min.

**POST `/api/classes/:classId/lectures/:lectureId/summarize`**
Flow: read `transcript.txt` → summarize via backend → save summary version → set as current
Optional body: `{ backend: 'gemini' | 'groq' | 'claude' | 'ollama' }` overrides config default.

SSE event shapes: `{ type: 'progress', step, message }` | `{ type: 'token', token }` | `{ type: 'done' }` | `{ type: 'error' | 'aborted', message }`

Abort: `POST .../abort` with `{ type: 'transcribe' | 'summarize' }`.

## Q&A

Requires a summary to exist. Two-step: generate questions → submit answers → get feedback (all via Claude).
- `POST .../qa/generate` — generates questions from current summary, appends a new round to `qa.json`
- `POST .../qa/answer` with `{ roundIndex, answers[] }` — evaluates answers, saves feedback

## Summary versions

Each summarize run creates a versioned entry. `currentSummary` on the lecture points to the active one. The web UI lets users switch versions or delete old ones.
