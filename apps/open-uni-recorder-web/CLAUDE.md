# open-uni-recorder-web

Next.js 15 App Router, port 3002. Calls NestJS directly — no API proxy layer.

## API calls

All fetches go through `lib/api.ts`:
```ts
apiUrl('/api/classes') // → NEXT_PUBLIC_API_URL + path, default http://localhost:3001
```
Never hardcode `localhost:3001` — always use `apiUrl()`.

## Pages

- `/classes` — list all classes, create/delete
- `/classes/[classId]` — class detail, lecture list, run pipeline, job status polling
- `/classes/[classId]/lectures/[lectureId]` — lecture detail, transcribe/summarize (SSE), Q&A, summary versions
- `/settings` — AI backend selection, health checks

## SSE consumption

Transcribe and summarize endpoints stream `text/event-stream`. Event shapes:
- `{ type: 'progress', step, message }` — status update
- `{ type: 'token', token }` — streaming summary token
- `{ type: 'done', status?, summary? }` — job complete
- `{ type: 'error' | 'aborted', message }` — failure

## Components

Local to `app/components/`: `NavBar`, `PageHeader`, `Modal`, `Toast`, `StatusBadge`, `BackendSelect`, `EmptyState`, `QASection`. Status label/color helpers live in `lib/status.ts`.

## Before implementing a feature

For non-trivial changes touching lecture processing, check the API docs first:
- `apps/open-uni-recorder-api/docs/lectures.md` — endpoint contracts, SSE format, lecture statuses
- `apps/open-uni-recorder-api/docs/pipeline.md` — pipeline flow
