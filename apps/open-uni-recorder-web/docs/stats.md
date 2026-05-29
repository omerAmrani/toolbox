# Stats Page (`/stats`)

Overview dashboard derived from `/api/classes` and per-class lecture data.

## Route

`/stats`

## Data

All data is fetched client-side on mount:
1. `GET /api/classes` — list of classes with `lectureCount`
2. `GET /api/classes/:classId/lectures` for every class (parallel)

No dedicated stats endpoint exists. All metrics are computed client-side.

## Derived metrics

| Metric | Derivation |
|--------|-----------|
| Summarized | `status === 'summarized' \| 'done'` |
| In processing | `status === 'summarizing' \| 'transcribing' \| 'processing'` |
| Pending | `status === 'pending'` |
| Errors | `status === 'error' \| 'failed' \| 'aborted'` |
| Active classes | classes not in `localStorage our:class:<id>:archived` |
| Weekly activity | grouped counts of `lectureDate` over last 8 weeks |
| Per-class progress | done/total + in-flight/error/pending breakdown bar |
| Status distribution | segmented bar across all lecture statuses |

## Placeholder tiles (בקרוב)

These tiles are rendered but show `—` with a "בקרוב" chip:

- **Audio hours** — requires a `duration` field on lecture records (backend-attach todo)
- **Reading time saved** — depends on `duration` (backend-attach todo)
- **Average lecture length** — depends on `duration` (backend-attach todo)
- **AI model usage** — requires a dedicated stats/metrics endpoint (backend-attach todo)
