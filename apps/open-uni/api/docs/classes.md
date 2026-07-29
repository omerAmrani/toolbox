# Classes

CRUD for courses. Each class groups lectures and optionally links to an OPAL course URL for auto-detection.

## API

- Module: `ClassesModule`
- Controller: `ClassesController` (`api/classes`)

Routes:
- `GET /api/classes` — list all classes; each row includes `lectureCount`
- `POST /api/classes` — create class (`name` required; `semester`, `year`, `code`, `opalCourseUrl` optional)
- `POST /api/classes/opal-metadata` — given `{ opalCourseUrl }`, logs into OPAL (reuses `DetectService`'s SSO login) and scrapes the course header to return `{ name, code, semester, year }`; used by the web "new course" modal — on success the class is created straight from the scrape, on failure the fields fall back to manual entry. Also used by the modal's edit mode when the OPAL URL is changed. 502 on scrape/login failure.
- `PATCH /api/classes/:classId` — update `name`, `opalCourseUrl`, `code`, `semester`, and/or `year`
- `DELETE /api/classes/:classId` — delete class and all its lectures

Fields: `id`, `name`, `semester` (OU semester letter: `א` | `ב` | `ג`), `year`, `opalCourseUrl`, `code` (OPAL course code, e.g. `10493`).

## Web

- Pages: classes list (`/classes`), class detail (`/classes/[classId]`)
- See [classes.md](../../open-uni-recorder-web/docs/classes.md)
