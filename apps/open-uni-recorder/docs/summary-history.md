# Summary History

Each lecture keeps a versioned history of summaries. Every time a summary is generated, a new version is saved rather than overwriting the previous one.

## Storage layout

```
data/classes/<classId>/lectures/<lectureId>/
  summaries/
    <id>.md       # one file per version, id = Date.now()
  meta.json       # includes: currentSummary (id), summaries ([{id, date, backend}])
```

Existing `summary.md` files are automatically migrated to `summaries/<id>.md` on first access.

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/classes/:classId/lectures/:lectureId/summaries` | List all versions `{ versions, currentSummary }` |
| `GET` | `/api/classes/:classId/lectures/:lectureId/summaries/:id` | Get content of a specific version |
| `PUT` | `/api/classes/:classId/lectures/:lectureId/summaries/:id/current` | Set a version as current |
| `DELETE` | `/api/classes/:classId/lectures/:lectureId/summaries/:id` | Delete a version |

`GET /api/classes/:classId/lectures/:lectureId/summary` returns the current version's content (unchanged from before).

## Behaviour

- Every summarize run creates a new version and automatically sets it as current.
- Versions are listed newest-first; current is always at the top.
- Deleting the current version auto-promotes the most recently created remaining version. If none remain, `currentSummary` is set to `null` and the UI shows "no summary".
- Each version stores: `id` (timestamp string), `date` (ISO), `backend` (e.g. `gemini`).
