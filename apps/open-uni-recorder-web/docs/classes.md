# Classes

## Web

- Pages: `/classes`, `/classes/[classId]`
- Components: `NewCourseModal`, `Modal`, `Toast`, `Status`

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
- Lectures in `transcribing / summarizing / processing` are highlighted as current
- Polls `GET .../lectures` every 5 seconds for lectures not actively running locally
- Class header: name, semester+year, code, total/summarized counts, edit (✎) and delete actions
- Edit (✎) opens `NewCourseModal` with `editTarget` set to the class — all fields (name/code/semester/year/opalCourseUrl) pre-filled and editable, saved via `PATCH /api/classes/:id` on submit
- Sync now calls the all-classes SSE endpoint (no per-class route yet — backend-attach todo)

**Gotcha:** polling only activates for lectures in `pending` status that have no local SSE job.
