# Transcription

Downloads a lecture video from OPAL and transcribes it to text using Whisper.

## API

- Modules: `DownloadModule`, `WhisperModule`
- Entry point: `LecturesController POST .../transcribe` (SSE) — see [lectures.md](lectures.md) for SSE details

**Flow:**
1. `DetectService.extractVideoUrl()` — Playwright login to OPAL, extracts direct video URL
2. `DownloadService.downloadAndTranscribe()` — downloads video, converts to `audio.mp3` via ffmpeg, runs Whisper
3. Saves result to `transcript.txt` in the lecture data directory
4. Sets lecture status: `transcribing` → `transcribed`
5. If `DELETE_MP3_AFTER_TRANSCRIBE=true`, deletes `audio.mp3` after saving transcript

**Backends** (set via `WHISPER_BACKEND`):
- `groq-whisper` — Groq Whisper API (requires `GROQ_API_KEY`)
- `whisper-cpp` — local whisper.cpp binary

**Config:** `WHISPER_MODEL` is stored on the lecture record after transcription.

**Gotcha:** transcript path must exist and be non-empty before summarization is allowed.

## Web

- Class detail page — "סכם" button runs transcribe + summarize in sequence via SSE
- Lecture detail page — "תמלל מחדש" re-runs transcription; "🧪 תמלל 30 דקות" runs with `test: true`
- See [lectures.md](../../open-uni-recorder-web/docs/lectures.md)
