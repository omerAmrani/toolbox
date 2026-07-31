# Health Checks

Tests AI backend connectivity and latency. Used by the settings page to verify API keys before running the pipeline.

## API

- Module: `HealthModule`
- Controller: `HealthController`

Routes:
- `POST /health/gemini`
- `POST /health/claude`
- `GET /health/ping`

No auth guard on any of these — `gemini`/`claude` take the key to test directly in the body, so there's nothing server-side to scope per user.

### `/health/ping`

Lightweight liveness check for the tray app to poll (see `apps/open-uni/docs/local-service.md`) — no auth, no external calls, no DB access. Response: `{ ok: true }`, always 200 if the process is up.

### `/health/gemini` and `/health/claude`

`POST` (not `GET`) — the API key lives client-side only (per-user, encrypted, see `apps/open-uni/web/lib/credentials.ts`) and is never stored server-side, so the caller sends it in the body on each check: `{ apiKey: string }`.

Response: `{ ok: boolean, configured: boolean, ms?: number, response?: string, error?: string }`

- `configured: false` — no `apiKey` in the request body; `ok` will be false
- `configured: true, ok: true` — backend responded successfully
- `configured: true, ok: false` — key sent but the request failed

There is no `/health/features` endpoint — the old server-side feature-availability check (based on env vars / a shared `settings.json`) was removed along with single-tenant credential storage. Each credential is per-user and client-side now, so "is it configured" is a client-side question (does `localStorage` have a decrypted value), not something the server can answer.

## Web

- Settings page — feature health banner at top of page, AI model cards with per-backend test buttons
- See [settings.md](../../open-uni-recorder-web/docs/settings.md)
