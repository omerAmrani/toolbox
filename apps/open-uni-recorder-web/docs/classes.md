# Classes

## Web

- Pages: `/classes`, `/classes/[classId]`
- Components: `NewCourseModal`, `Modal`, `Toast`, `Status`

**Classes list (`/classes`):**
- Grid of class cards with name, semester/year (Hebrew), lecture count, and first-char icon
- Card color assigned randomly from a small palette on create, persisted in localStorage
- Cards sorted by most-recent lecture activity (falls back to year → semester → name until `lastLectureAt` is available from API)
- "הוסף קורס" button opens `NewCourseModal` (name, OPAL URL, semester, year — all required at UI level)
- Delete class with confirmation
- Archive class stored in localStorage (`our:class:<id>:archived`) — backend-attach todo
- Glance stats row: total classes, total lectures, summarized count (hours-saved tile removed — depends on duration field)

**Class detail (`/classes/[classId]`):**
- Timeline layout (`.timeline` / `.tl-item` / `.lec-card`) — no table view, no layout toggle
- Lecture number derived from chronological order within the class
- Per-lecture actions depend on status: summarize, retry (on failure), skip, archive (UI-stub), delete; whole row is clickable → lecture detail
- Lectures in `transcribing / summarizing / processing` are highlighted as current
- Polls `GET .../lectures` every 5 seconds for lectures not actively running locally
- Class header: name, semester+year, editable `opalCourseUrl`, total/summarized counts, sync-now and delete actions
- Sync now calls the all-classes SSE endpoint (no per-class route yet — backend-attach todo)

**Gotcha:** polling only activates for lectures in `pending` status that have no local SSE job.
