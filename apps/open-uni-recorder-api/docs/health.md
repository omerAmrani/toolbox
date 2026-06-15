# Health Checks

Tests AI backend connectivity and latency. Used by the settings page to verify API keys before running the pipeline.

## API

- Module: `HealthModule`
- Controller: `HealthController`

Routes:
- `GET /api/health/gemini`
- `GET /api/health/claude`
- `GET /api/health/features`

### `/api/health/gemini` and `/api/health/claude`

Response: `{ ok: boolean, configured: boolean, ms?: number, response?: string, error?: string }`

- `configured: false` — API key not set; `ok` will be false
- `configured: true, ok: true` — backend responded successfully
- `configured: true, ok: false` — key set but request failed

### `/api/health/features`

Returns the availability of each app feature based on env var presence at startup. Missing var names are never exposed — only feature names and availability.

Response: `{ feature: string, available: boolean }[]`

Features:
| feature | required env vars |
|---|---|
| `transcription` | `GROQ_API_KEY` |
| `summarization` | `GEMINI_API_KEY` (default) or `ANTHROPIC_API_KEY` if `SUMMARIZE_BACKEND=claude` |
| `lecture-download` | `OPENU_USERNAME`, `OPENU_PASSWORD`, `OPENU_ID` |
| `email-notifications` | `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `NOTIFY_EMAIL` |

Missing features are also logged at startup via `onModuleInit` — var names appear in server logs only, never in the HTTP response.

## Web

- Settings page — feature health banner at top of page, AI model cards with per-backend test buttons
- See [settings.md](../../open-uni-recorder-web/docs/settings.md)
