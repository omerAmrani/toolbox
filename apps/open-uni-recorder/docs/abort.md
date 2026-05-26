# Abort (Stop) Feature

Users can stop an in-progress transcription or summarization from both the lecture page and the class-detail page.

## API

```
POST /api/classes/:classId/lectures/:lectureId/abort
Body: { "type": "transcribe" | "summarize" }
Response: { "ok": true } | 404 if no active job
```

## Server behaviour

- Each active transcribe/summarize job registers an `AbortController` in `activeAbortControllers` (keyed `classId/lectureId:type`).
- On abort:
  - **Transcribe**: the signal is passed to both `extractVideoUrl` (closes the Playwright browser immediately) and `downloadAndTranscribe` (kills ffmpeg with `SIGKILL`). All `tmp/chunk_NNN.wav` files are deleted; no `transcript.txt` is written.
  - **Summarize**: the `mergeSummaries` promise is raced against an abort promise via `withAbort()` in `lib/summarize.js`; the LLM call is abandoned mid-stream.
- Lecture status is set to `'aborted'` (distinct from `'error'`).
- An `{ type: 'aborted' }` SSE event is sent to connected clients before the stream closes.

## Partial work

Aborted transcriptions are fully discarded — no partial transcript is saved. The lecture returns to a state where the user can retry the full pipeline.

## Frontend

- **Lecture page**: a "⏹ עצור" button appears in the actions sidebar while any job is active. Clicking it immediately disables the button and shows "מבטל..." before sending the abort request.
- **Class-detail page**: a "⏹ עצור" button appears for any lecture whose status is `processing`, `transcribing`, or `summarizing` — both for jobs started in the current session and for background pipeline jobs. `stopJobByStatus(lectureId, type)` is called directly from the button with the correct abort type derived from the status. For session-tracked jobs, `stopJob` also shows "מבטל..." immediately in the running badge.
- After abort completes, both pages show a "הפעולה בוטלה" toast and call `loadLecture()` / `loadLectures()` to reflect the `aborted` status badge.
- The server logs `[transcribe] aborted: classId/lectureId` to stdout when the abort is handled.
- `aborted` status shows as "בוטל" with the error badge style.
