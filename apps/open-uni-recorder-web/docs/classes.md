# Classes

## Web

- Pages: `/classes`, `/classes/[classId]`
- Components: `EmptyState`, `Modal`, `StatusBadge`, `BackendSelect`, `Toast`

**Classes list (`/classes`):**
- Grid of class cards with name, semester/year, lecture count
- Create class modal (name required, semester + year optional)
- Delete class with confirmation

**Class detail (`/classes/[classId]`):**
- Lecture table: date, name, status badge, action buttons
- Per-lecture actions depend on status: run pipeline, re-summarize, abort, retry, edit, delete
- "Run" button runs transcribe then summarize in sequence via SSE; attaches progress label inline
- Polls `GET .../lectures` every 5 seconds for pending lectures not actively running locally
- Backend picker (Gemini / Groq / Claude / Ollama) applies to summarize step
- OPAL URL field — saves `opalCourseUrl` to the class; required for auto-detection
- Transcript search input — see [API search.md](../../open-uni-recorder-api/docs/search.md)

**Gotcha:** polling only activates for lectures in `pending` status that have no local SSE job. Once the pipeline picks them up server-side, status transitions keep coming via polling until `done`.
