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

- Shows last cron run info (timestamp, trigger type, found/queued counts)

**Reload from disk:**
- `POST /api/reload-from-disk` — re-syncs SQLite from `meta.json` files on disk
- Useful after manually moving data files or recovering from a DB wipe

**Sync (detect new lectures):**
- "בדוק עכשיו" runs `POST /api/classes/sync` (SSE), scoped to the semester picked in the dropdown next to it
- Detected lectures are created immediately (`pending`) by the API — there's no manual add/skip step. The panel shows existing non-summarized lectures per class plus a "just added" list for whatever the sync run created.
- Only shown for classes with `opalCourseUrl` configured
- List area is capped at 320px with internal scroll to avoid stretching the adjacent settings card
- There's no separate processing-queue panel — a lecture created here processes the same way as any other `pending` lecture (per-lecture action on the class page; cron only detects + emails, it never auto-transcribes/summarizes)
- **Active semester:** every time this dropdown changes, the selection is also persisted server-side via `PUT /api/classes/active-semester` — this is the same value `runFullPipeline` (cron and `run-pipeline`) uses to scope which classes it checks. Until a selection is ever made, cron checks every OPAL-linked class regardless of semester.

**Automatic schedule & notifications** (new card, below the sync panel):
- Weekday toggle (א–ש) + `<input type="time">`, saved via `PUT /api/classes/cron-schedule` — takes effect immediately, no restart (the backend swaps the live `CronJob` via `SchedulerRegistry`)
- Shows the computed next-run time (`GET /api/classes/cron-schedule` → `nextRun`) so you can confirm the schedule is live without waiting for it to fire
- Email field for the summary/detection recipient, saved via `PUT /api/classes/notify-email` — replaces the old `NOTIFY_EMAIL` env var entirely; email sending is skipped until this is set

**AI model health:**
- Cards for Gemini and Claude
- Per-card test button + "בדוק את כולם"
- Shows status dot, latency, and a sample response excerpt
