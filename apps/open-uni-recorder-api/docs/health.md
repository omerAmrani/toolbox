# Health Checks

Tests AI backend connectivity and latency. Used by the settings page to verify API keys before running the pipeline.

## API

- Module: `HealthModule`
- Controller: `HealthController`

Routes:
- `GET /api/health/gemini`
- `GET /api/health/groq`
- `GET /api/health/claude`
- `GET /api/health/ollama`

Response: `{ ok: boolean, configured: boolean, ms?: number, response?: string, error?: string }`

- `configured: false` — API key not set; `ok` will be false
- `configured: true, ok: true` — backend responded successfully
- `configured: true, ok: false` — key set but request failed

## Web

- Settings page — AI model cards with per-backend test buttons and a "בדוק את כולם" button
- See [settings.md](../../open-uni-recorder-web/docs/settings.md)
