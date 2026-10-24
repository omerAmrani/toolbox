# Settings

Single-page control panel at `/settings` for managing app configuration, the processing queue, and AI backends.

## Web

- Page: `/settings`
- Calls multiple API endpoints; all cards load independently on mount

**Data directory:**
- Shows current data path
- "בחר תיקייה" opens a native macOS folder picker via `POST /api/data-dir/pick` (osascript)
- Warns if selected path has no existing DB
- Saving restarts the API server (`process.exit(0)` server-side)

**Reload from disk:**
- `POST /api/reload-from-disk` — re-syncs SQLite from `meta.json` files on disk
- Useful after manually moving data files or recovering from a DB wipe

**Sync (detect new lectures):**
- "בדוק עכשיו" runs `POST /api/classes/sync` (SSE), scoped to the semester picked in the dropdown next to it, using the OPAL credentials from the API's `.env` — see `apps/open-uni/api/docs/classes.md`
- Detected lectures are created immediately (`pending`) by the API — there's no manual add/skip step. The panel shows existing non-summarized lectures per class plus a "just added" list for whatever the sync run created.
- Only shown for classes with `opalCourseUrl` configured
- List area is capped at 320px with internal scroll to avoid stretching the adjacent settings card
- There's no separate processing-queue panel — a lecture created here processes the same way as any other `pending` lecture (per-lecture action on the class page)
- There is no automatic/unattended detection — "בדוק עכשיו" is a manual trigger only

**Credentials** (read-only — credentials live in `apps/open-uni/api/.env`, see docs/adr/0002):
- Checklist of OPAL / Groq / Gemini / Claude keys from `GET /api/config/status` (✅/❌, never the values), plus which keys each action needs
- Groq / Gemini / Claude provider names link to the provider's API-keys page (new tab); hovering shows a `title` hint with the price tier and which `.env` var to paste into
- No credential form — edit `.env` and restart the API. Transcribe/summarize buttons on the class and lecture pages are disabled with a hint when their keys are missing (`lib/configStatus.ts`)

**AI model health:**
- Cards for Gemini and Claude
- Per-card test button + "בדוק את כולם" — `POST /health/gemini` or `POST /health/claude`, which test the key from the API's `.env` (see `apps/open-uni/api/docs/health.md`)
- Shows status dot, latency, and a sample response excerpt
