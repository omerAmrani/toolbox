# Classes

CRUD for courses. Each class groups lectures and optionally links to an OPAL course URL for auto-detection.

## API

- Module: `ClassesModule`
- Controller: `ClassesController` (`api/classes`)

Routes:
- `GET /api/classes` — list all classes; each row includes `lectureCount`
- `POST /api/classes` — create class (`name` required; `semester`, `year` optional)
- `PATCH /api/classes/:classId` — update `opalCourseUrl`
- `DELETE /api/classes/:classId` — delete class and all its lectures

Fields: `id`, `name`, `semester` (`spring` | `summer` | `fall` | `winter`), `year`, `opalCourseUrl`.

## Web

- Pages: classes list (`/classes`), class detail (`/classes/[classId]`)
- See [classes.md](../../open-uni-recorder-web/docs/classes.md)
