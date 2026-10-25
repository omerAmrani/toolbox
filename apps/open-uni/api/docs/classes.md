# Classes

CRUD for courses. Each class groups lectures and optionally links to an OPAL course URL for auto-detection.

## API

- Module: `ClassesModule`
- Controller: `ClassesController` (`api/classes`)

**Ownership:** every route except `opal-metadata` requires a valid `auth_token` session cookie (Google OAuth + JWT, see `docs/auth.md`). In local mode (no `GOOGLE_CLIENT_ID`) there is no cookie — every request is the fixed `local` user. `POST /api/classes` stamps the class with `req.user.sub` as `userId`; every other route 404s if the logged-in user doesn't own the class (same response as a missing class, so ownership can't be probed). No cookie → 401. Real per-user accounts replaced the earlier anonymous `X-Device-Id` scoping — remote/multi-user mode is tracked in #9.

**OPAL credentials:** read from the API's `.env` (`OPENU_USERNAME`/`OPENU_PASSWORD`/`OPENU_ID`, see `src/credentials.ts`, docs/adr/0002). Any route that needs them (`opal-metadata`, `:classId/detect`) returns `400` naming the missing keys if they aren't set.

Routes:
- `GET /api/classes` — list all classes owned by the caller; each row includes `lectureCount`
- `POST /api/classes` — create class owned by the caller (`name` required; `semester`, `year`, `code`, `opalCourseUrl` optional)
- `POST /api/classes/opal-metadata` — given `{ opalCourseUrl }`, logs into OPAL (reuses `DetectService`'s SSO login) and scrapes the course header to return `{ name, code, semester, year }`; used by the web "new course" modal — on success the class is created straight from the scrape, on failure the fields fall back to manual entry. Also used by the modal's edit mode when the OPAL URL is changed. 400 if the OPAL keys are missing from `.env`, 502 on scrape/login failure.
- `POST /api/classes/:classId/detect` — manual "check for new lectures" for one class; uses the OPAL credentials from `.env`, creates any newly found lectures as `pending`. Subject to the per-user job cap — `429` if the caller already has a transcribe/detect/sync job running (see `docs/lectures.md`).
- `PATCH /api/classes/:classId` — update `name`, `opalCourseUrl`, `code`, `semester`, and/or `year`
- `DELETE /api/classes/:classId` — delete class and all its lectures

Fields: `id`, `name`, `semester` (OU semester letter: `א` | `ב` | `ג`), `year`, `opalCourseUrl`, `code` (OPAL course code, e.g. `10493`).

## Web

- Pages: classes list (`/classes`), class detail (`/classes/[classId]`)
- See [classes.md](../../open-uni-recorder-web/docs/classes.md)
