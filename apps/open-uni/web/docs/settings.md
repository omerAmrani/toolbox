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
- "בדוק עכשיו" runs `POST /api/classes/sync` (SSE), scoped to the semester picked in the dropdown next to it, with the caller's decrypted OPAL credentials (`requireCredentials()`, prompts for the passphrase if locked) sent in the request body — the server never stores an OPAL login, see `apps/open-uni/api/docs/classes.md`
- Detected lectures are created immediately (`pending`) by the API — there's no manual add/skip step. The panel shows existing non-summarized lectures per class plus a "just added" list for whatever the sync run created.
- Only shown for classes with `opalCourseUrl` configured
- List area is capped at 320px with internal scroll to avoid stretching the adjacent settings card
- There's no separate processing-queue panel — a lecture created here processes the same way as any other `pending` lecture (per-lecture action on the class page)
- There is no automatic/unattended detection anymore — the old cron (`runFullPipeline`, `SchedulerRegistry`) was removed because it can't work with per-user, client-side-only credentials (no browser open to decrypt them for an unattended run); "בדוק עכשיו" is a manual, per-user trigger only
- Email field for the summary/detection recipient, saved via `PUT /api/classes/notify-email`

**Credentials** (all requests carry the session's `auth_token` cookie — every class/lecture/sync/credential is scoped to the logged-in user, see `apps/open-uni/api/docs/classes.md`):
- OpenU username/ID/password + Groq/Gemini/Anthropic API keys, encrypted client-side with a user passphrase (WebCrypto `PBKDF2` + `AES-GCM`) and stored in `localStorage` — see `lib/credentials.ts`. Nothing is sent to or persisted by the server except per-request, in-memory, for the life of that one call (sync, transcribe, summarize, health check)
- No server-side credential storage or `/api/credentials` endpoint exists — a locked/missing credential store prompts for the passphrase (`requireCredentials()`) before any action that needs one
- Non-secret fields (OpenU username/ID) prefill from the decrypted store once it's been unlocked this session (right after saving, or after any action that called `requireCredentials()`); password/API key fields never prefill, even when unlocked — they stay blank in the form regardless (`draftFromUnlocked()` in `app/settings/page.tsx`)
- "מחק פרטים שמורים" clears the encrypted blob from `localStorage` entirely (no partial-clear of individual fields)

**AI model health:**
- Cards for Gemini and Claude
- Per-card test button + "בדוק את כולם" — sends the decrypted key from local storage to `POST /health/gemini` or `POST /health/claude` (see `apps/open-uni/api/docs/health.md`)
- Shows status dot, latency, and a sample response excerpt
