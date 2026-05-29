# Lectures

## Web

- Page: `/classes/[classId]/lectures/[lectureId]`
- Components: `BackendSelect`, `QASection`, `Toast`, `Status`

**Layout:**
- Split view: main column (summary + tabs) + sidebar (metadata + actions)
- Reading progress bar sticky above the summary card (scroll-tracked)
- Header: back link, lecture name, date, status pill, reading-time estimate (~200 wpm)
- Sidebar actions: re-transcribe (full + 30-min test), re-summarize, export, versions

**Summary tab:**
- Summary rendered as markdown (via `marked`) inside `.summary` wrapper
- Streaming tokens displayed in real-time during summarization
- Re-summarize button with backend picker (`BackendSelect`)
- Re-transcribe: full audio or 30-min test mode

**Summary version history:**
- Expandable panel listing all versions with date + backend
- Switch active version (`PUT .../summaries/:id/current`)
- Delete old versions

**Transcript viewer:**
- Expandable panel showing raw `transcript.txt`
- Loaded on demand

**Q&A section (`QASection` component):**
- Generate questions from current summary via `POST .../qa/generate`
- Text inputs for each answer; submit via `POST .../qa/answer` for AI feedback
- Multiple rounds supported — each generate appends a new round
- Fetch existing rounds on load via `GET .../qa`
- Requires a current summary to exist

**Gotcha:** summary streaming uses a buffer ref (`streamBufferRef`) to accumulate tokens before rendering, avoiding excessive re-renders during fast token streams.
