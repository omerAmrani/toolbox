# Lectures

## Web

- Page: `/classes/[classId]/lectures/[lectureId]`
- Components: `BackendSelect`, `Toast`, `Status`

**Layout:**
- Split view: main column (tabbed content pane) + sidebar (metadata + actions)
- Reading progress bar sticky above the content (scroll-tracked)
- Header: lecture name, date, status pill, reading-time estimate (~200 wpm), prev/next lecture navigation buttons, export
- Sidebar actions: re-transcribe, re-summarize, delete lecture
- Breadcrumb (in the global `Topbar`) shows course name and the actual lecture name, fetched independently of this page

**Lecture navigation:**
- Prev/Next buttons in the header action bar navigate between lectures in chronological order (`COALESCE(lectureDate, addedAt) ASC`)
- Buttons are conditionally rendered — hidden when already at the first or last lecture
- Lecture list fetched from `GET /api/classes/:classId/lectures` on page load

**Content pane (single `activeView` state: `'summary' | 'transcript'`):**
- One markdown/text pane. There's no promote/"set as current" mechanism — the backend always treats the newest surviving summary version as the one `GET .../summary` returns, and the page always defaults to that on load
- The `<select>` of all summary versions (backend label + generation-order number, e.g. "Claude #2") is a pure viewer: picking one just fetches that version's text (`GET .../summaries/:id`, read-only) into the pane via local `viewedSummaryId` state — it does not change which version is latest, and resets back to the latest on next page load
- "תמלול" toggles the pane to the raw `transcript.txt` (lazy-loaded on first switch) and back to the summary on a second click
- Toolbar row (same line as the picker): "העתק" copies whichever content is currently shown (summary or transcript); "מחק" deletes whichever summary version is currently selected (summary view only) — if that was the latest, the next-newest remaining version becomes latest
- Re-summarize button with backend picker (`BackendSelect`); re-transcribe re-runs full transcription (no test-mode variant)

**Gotcha:** summary streaming uses a buffer ref (`streamBufferRef`) to accumulate tokens before rendering, avoiding excessive re-renders during fast token streams.
