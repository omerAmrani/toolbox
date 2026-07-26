# Settings

Single-page control panel at `/settings` for managing app configuration, the processing queue, and AI backends.

## Web

- Page: `/settings`
- Calls multiple API endpoints; all cards load independently on mount

**Feature health banner:**
- Component: `app/components/FeatureHealthBanner.tsx`
- Fetches `GET /health/features` on mount
- Renders above the settings grid only when at least one feature is unavailable
- Shows unavailable features by name with "לא מוגדר", available features as green pills
- Dismiss button hides it for the session (not persisted)
- No env var names are shown — feature names only

**Data directory:**
- Shows current data path
- "בחר תיקייה" opens a native macOS folder picker via `POST /api/data-dir/pick` (osascript)
- Warns if selected path has no existing DB
- Saving restarts the API server (`process.exit(0)` server-side)

- Shows last cron run info (timestamp, trigger type, found/queued counts)

**Reload from disk:**
- `POST /api/reload-from-disk` — re-syncs SQLite from `meta.json` files on disk
- Useful after manually moving data files or recovering from a DB wipe

**Sync (detect new lectures):**
- "בדוק עכשיו" runs `POST /api/classes/sync` (SSE)
- Detected lectures are created immediately (`pending`) by the API — there's no manual add/skip step. The panel shows existing non-summarized lectures per class plus a "just added" list for whatever the sync run created.
- Only shown for classes with `opalCourseUrl` configured
- List area is capped at 320px with internal scroll to avoid stretching the adjacent settings card
- There's no separate processing-queue panel — a lecture created here processes the same way as any other `pending` lecture (per-lecture action on the class page, or the next queue/cron run).

**Email test:**
- Dropdown of all lectures with a current summary
- Sends test summary email via `POST /api/classes/test-email`

**Cron test:**
- "הרץ קרון עכשיו" calls `POST /api/classes/run-pipeline` — full detect + queue run

**AI model health:**
- Cards for Gemini, Groq, Claude, Ollama
- Per-card test button + "בדוק את כולם"
- Shows status dot, latency, and a sample response excerpt
