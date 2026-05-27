# Lectures

## Web

- Page: `/classes/[classId]/lectures/[lectureId]`
- Components: `StatusBadge`, `BackendSelect`, `QASection`, `Toast`

**Summary tab:**
- Summary rendered as markdown (via `marked`)
- Streaming tokens displayed in real-time during summarization
- Re-summarize button with backend picker
- Re-transcribe buttons: full and 30-min test mode

**Summary version history:**
- Expandable panel listing all versions with date + backend
- Switch active version (`PUT .../summaries/:id/current`)
- Delete old versions

**Transcript viewer:**
- Expandable panel showing raw `transcript.txt`
- Loaded on demand

**Q&A section (`QASection` component):**
- Generate questions from current summary
- Text inputs for each answer; submit for AI feedback
- Multiple rounds supported — each generate appends a new round
- Requires a current summary to exist

**Gotcha:** summary streaming uses a buffer ref (`streamBufferRef`) to accumulate tokens before rendering, avoiding excessive re-renders during fast token streams.
