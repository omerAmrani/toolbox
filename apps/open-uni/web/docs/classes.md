# Classes

## Web

- Pages: `/classes`, `/classes/[classId]`
- Components: `NewCourseModal`, `Modal`, `Toast`, `Status`
- All `/api/classes/**` calls go through `apiFetch` (`lib/api.ts`), not raw `fetch` — it sends the `auth_token` session cookie (`credentials: 'include'`) the API uses to scope classes/lectures to the logged-in user, and redirects to `/login` on a 401 (see `apps/open-uni/api/docs/classes.md`). Endpoints that aren't user-scoped (`/api/data-dir`, `/api/reload-from-disk`) can stay on raw `fetch`.

**Classes list (`/classes`):**
- Grid of class cards with name, semester/year (Hebrew), lecture count, and first-char icon
- Card color assigned randomly from a small palette on create, persisted in localStorage
- Cards sorted by most-recent lecture activity (falls back to year → semester → name until `lastLectureAt` is available from API)
- "הוסף קורס" button opens `NewCourseModal` (create mode), which shows only the OPAL URL field by default (name required at UI level)
- On blur of the OPAL URL field, `NewCourseModal` calls `POST /api/classes/opal-metadata` to scrape name/code/semester/year from the OPAL course header. On success (a `name` came back) the class is created immediately (`POST /api/classes`) and the modal closes — no manual review step. The name/code/semester/year fields only appear as a manual fallback if the scrape fails, errors, or doesn't return a `name`; submitting without a name also reveals them.
- `NewCourseModal` doubles as the edit form: passing `editTarget` pre-fills all fields (manual fields always shown, no auto-create-on-scrape) and submits via `PATCH /api/classes/:id` instead of `POST /api/classes`.
- Class cards and the detail header show the course `code` (`class-card__code` / `detail-h__code`), falling back to `—` when unset
- `semester` values are OU semester letters (`א`/`ב`/`ג`), not season names — see `SEMESTER_HE`/`SEMESTER_ORDER`
- Delete class with confirmation
- Archive class stored in localStorage (`our:class:<id>:archived`) — backend-attach todo
- Glance stats row: total classes, total lectures, summarized count (hours-saved tile removed — depends on duration field)

**Class detail (`/classes/[classId]`):**
- Timeline layout (`.timeline` / `.tl-item` / `.lec-card`) — no table view, no layout toggle
- Lecture number derived from chronological order within the class
- Per-lecture actions depend on status: summarize, retry (on failure), skip, archive (UI-stub), delete; whole row is clickable → lecture detail
- "▶ הפעל" (pending) runs transcribe then summarize; it's disabled with a hint tooltip when OPAL/Groq keys are missing, and runs transcribe-only when no Gemini/Claude key is confirmed (`GET /api/config/status`, `lib/configStatus.ts`). "▶ סכם" is disabled when no summarize key is set
- A lecture is busy when its status is `transcribing / summarizing` or this tab is running a job for it. Busy lectures are highlighted as current, show a spinning status dot plus an animated progress bar that keeps moving (no percentage), and hide their run actions. The card also shows the latest SSE `progress` message from the job (e.g. `מוריד: 34% (40:00 / 1:40:00)`); during the download step the bar fills to the event's `pct` instead of animating. While this tab drives the pipeline, the label shows the step it's on (`pending` → מתמלל, `transcribed` → מסכם), because the DB status lags between the transcribe and summarize calls
- Polls `GET .../lectures` every 5 seconds while any lecture is busy
- Class header: name, semester+year, code, total/summarized counts, edit (✎) and delete actions
- Edit (✎) opens `NewCourseModal` with `editTarget` set to the class — all fields (name/code/semester/year/opalCourseUrl) pre-filled and editable, saved via `PATCH /api/classes/:id` on submit
- Sync now calls the all-classes SSE endpoint (no per-class route yet — backend-attach todo)

**Gotcha:** the pipeline is driven from the browser (two sequential SSE calls). A refresh between them leaves the lecture at `transcribed` with no summarize started — see #5.
