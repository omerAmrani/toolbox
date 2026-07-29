# Transcript Search

Full-text search across lecture transcripts. Scoped to a class or global across all classes.

## API

- Controller: `AppController`
- Route: `GET /api/search?q=<query>&classId=<id>`

**Behavior:**
- `q` must be at least 2 characters
- `classId` is optional; omitting it searches across all classes
- Scans `transcript.txt` files on disk (not a DB index)
- Returns up to one match per lecture: `{ classId, lectureId, lectureName, snippet }` where snippet is ±100/200 chars around the first match

**Gotcha:** case-insensitive substring match; no ranking or multi-match per lecture.

## Web

- Class detail page — search input in the header card; results link directly to the lecture detail page
- See [classes.md](../../open-uni-recorder-web/docs/classes.md)
