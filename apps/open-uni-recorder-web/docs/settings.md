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

**Queue monitor:**
- Shows pending lectures with class name, lecture name, date
- "הפעל תור" triggers `POST /api/classes/run-queue`
- Skip individual lectures from the queue
- Auto-refreshes every 3 seconds while any lecture is in `processing` status
- Shows last cron run info (timestamp, trigger type, found/queued counts)

**Reload from disk:**
- `POST /api/reload-from-disk` — re-syncs SQLite from `meta.json` files on disk
- Useful after manually moving data files or recovering from a DB wipe

**Sync (detect new lectures):**
- "בדוק הרצאות חדשות" runs `POST /api/classes/sync` (SSE)
- Shows per-class results: existing lectures with status, new lectures with queue/skip buttons
- Only shown for classes with `opalCourseUrl` configured
- List area (sync results + archive) is capped at 320px with internal scroll to avoid stretching the adjacent settings card

**Archive:**
- Lists all `skipped` lectures across all classes (inside the same scrollable area as sync results)
- "↩ הוצא מארכיון" unskips a lecture back to `pending`

**Email test:**
- Dropdown of all lectures with a current summary
- Sends test summary email via `POST /api/classes/test-email`

**Cron test:**
- "הרץ קרון עכשיו" calls `POST /api/classes/run-pipeline` — full detect + queue run

**AI model health:**
- Cards for Gemini, Groq, Claude, Ollama
- Per-card test button + "בדוק את כולם"
- Shows status dot, latency, and a sample response excerpt
