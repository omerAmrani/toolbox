# SQLite Storage Migration

Metadata is stored in SQLite (`recorder-db/recorder.db`). Files (mp3, txt, md) stay on disk under `recorder-db/classes/`.

## Data layout

```
/recorder-db/               ← sibling of the project directory
  recorder.db               ← SQLite database (WAL mode)
  classes/
    <classId>/
      meta.json             ← backup for reload-from-disk
      lectures/
        <lectureId>/
          meta.json         ← backup for reload-from-disk
          audio.mp3
          transcript.txt
          summaries/
            <id>.md
```

## Schema

**classes**: `id, name, semester, year, createdAt, opalCourseUrl`

**lectures**: `id, classId, name, url, lectureDate, addedAt, summarizedAt, whisperModel, whisperBackend, summarizeModel, summarizeBackend, status, currentSummary, lastError, lastErrorAt, startedAt`

**summaries**: `id, lectureId, date, backend`

## Reload from disk

If the DB is lost or corrupted, the settings page has a "טען מחדש מדיסק" button. It calls `POST /api/reload-from-disk`, which scans `recorder-db/classes/` and rebuilds the DB from `meta.json` backup files.

`meta.json` files are written alongside every DB write and serve as the recovery source.

## Updating the schema

Adding a column: `ALTER TABLE x ADD COLUMN y TEXT` — trivial.

Dropping or renaming: delete `recorder.db` and restart the server. Migration will rebuild it from disk.
