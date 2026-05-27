# Summarization

Generates an AI summary from a lecture transcript. Supports multiple backends and keeps a versioned history of summaries.

## API

- Module: `SummarizeModule`
- Entry point: `LecturesController POST .../summarize` (SSE) — see [lectures.md](lectures.md) for SSE details

**Flow:**
1. Reads `transcript.txt`
2. `SummarizeService.getSummarizer(backend)` selects the backend
3. `mergeSummaries([transcript], onProgress, onToken)` — chunking + merge logic
4. Saves result as a new versioned file; sets it as `currentSummary`
5. Sets lecture status: `summarizing` → `summarized`

**Backends** (set via `SUMMARIZE_BACKEND`, overridable per-request with `{ backend }`):
- `gemini` — Google Gemini 2.0 Flash (requires `GEMINI_API_KEY`)
- `groq` — LLaMA 3.3 70B via Groq Cloud (requires `GROQ_API_KEY`)
- `claude` — Anthropic Claude Sonnet (requires `ANTHROPIC_API_KEY`)
- `ollama` — local Ollama instance at `localhost:11434`

**Versions:** each run appends a new version entry. `currentSummary` on the lecture points to the active one. Old versions can be switched to or deleted via the summaries routes.

**Output language:** controlled by `OUTPUT_LANG` config.

## Web

- Lecture detail page — summary rendered as markdown; version history panel; re-summarize with backend picker
- See [lectures.md](../../open-uni-recorder-web/docs/lectures.md)
