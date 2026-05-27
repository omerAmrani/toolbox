# open-uni-recorder

Personal tool for automatically detecting, downloading, transcribing, and summarizing Open University lectures from OPAL.

**Stack:** NestJS API (port 3001) · Next.js 15 web UI (port 3000) · SQLite · Whisper (Groq / whisper.cpp) · AI summarization (Gemini / Groq / Claude / Ollama)

**Local dev:** `turbo run dev --filter=@toolbox/open-uni-recorder-api` and `turbo run dev --filter=@toolbox/open-uni-recorder-web`

---

## Features

- **Classes** — organize lectures by course, optional semester/year metadata
  - API: [classes.md](../apps/open-uni-recorder-api/docs/classes.md)
  - Web: [classes.md](../apps/open-uni-recorder-web/docs/classes.md)

- **Transcription** — download lecture video from OPAL and transcribe with Whisper
  - API: [transcribe.md](../apps/open-uni-recorder-api/docs/transcribe.md)
  - Web: [lectures.md](../apps/open-uni-recorder-web/docs/lectures.md)

- **Summarization** — generate AI summary from transcript; multiple backends, versioned history
  - API: [summarize.md](../apps/open-uni-recorder-api/docs/summarize.md)
  - Web: [lectures.md](../apps/open-uni-recorder-web/docs/lectures.md)

- **Q&A** — generate comprehension questions from a summary and evaluate answers (Claude only)
  - API: [qa.md](../apps/open-uni-recorder-api/docs/qa.md)
  - Web: [lectures.md](../apps/open-uni-recorder-web/docs/lectures.md)

- **OPAL detection** — auto-detect new lectures from an OPAL course page via Playwright
  - API: [detect.md](../apps/open-uni-recorder-api/docs/detect.md)
  - Web: [settings.md](../apps/open-uni-recorder-web/docs/settings.md)

- **Pipeline** — automated queue: detect → transcribe → summarize → email, cron-triggered
  - API: [pipeline.md](../apps/open-uni-recorder-api/docs/pipeline.md)

- **Email notifications** — send summary email via Gmail on pipeline completion or on demand
  - API: [email.md](../apps/open-uni-recorder-api/docs/email.md)
  - Web: [settings.md](../apps/open-uni-recorder-web/docs/settings.md)

- **Transcript search** — full-text search across transcripts within a class
  - API: [search.md](../apps/open-uni-recorder-api/docs/search.md)
  - Web: [classes.md](../apps/open-uni-recorder-web/docs/classes.md)

- **Health checks** — test AI backend connectivity and latency
  - API: [health.md](../apps/open-uni-recorder-api/docs/health.md)
  - Web: [settings.md](../apps/open-uni-recorder-web/docs/settings.md)

- **Settings** — data directory config, queue monitor, disk reload, archive of skipped lectures
  - Web: [settings.md](../apps/open-uni-recorder-web/docs/settings.md)
