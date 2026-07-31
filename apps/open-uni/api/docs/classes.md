# Classes

CRUD for courses. Each class groups lectures and optionally links to an OPAL course URL for auto-detection.

## API

- Module: `ClassesModule`
- Controller: `ClassesController` (`api/classes`)

**Ownership:** every route except `opal-metadata` requires a valid `auth_token` session cookie (magic-link + JWT, see `docs/health.md`'s auth note and `src/modules/auth`). `POST /api/classes` stamps the class with `req.user.sub` as `userId`; every other route 404s if the logged-in user doesn't own the class (same response as a missing class, so ownership can't be probed). No cookie → 401. Real per-user accounts replaced the earlier anonymous `X-Device-Id` scoping — see `todo-features.md` at the repo root.

**OPAL credentials:** the server never stores an OPAL login. Any route that needs one (`opal-metadata`, `:classId/detect`) takes `opalUsername`/`opalPassword`/`opalId` in the request body, supplied per-request by the client (see `apps/open-uni/web/lib/credentials.ts` for the client-side encrypted store) and used in-memory only for the life of that request.

Routes:
- `GET /api/classes` — list all classes owned by the caller; each row includes `lectureCount`
- `POST /api/classes` — create class owned by the caller (`name` required; `semester`, `year`, `code`, `opalCourseUrl` optional)
- `POST /api/classes/opal-metadata` — given `{ opalCourseUrl, opalUsername, opalPassword, opalId }`, logs into OPAL (reuses `DetectService`'s SSO login) and scrapes the course header to return `{ name, code, semester, year }`; used by the web "new course" modal — on success the class is created straight from the scrape, on failure the fields fall back to manual entry. Also used by the modal's edit mode when the OPAL URL is changed. 400 if credentials are missing, 502 on scrape/login failure.
- `POST /api/classes/:classId/detect` — manual "check for new lectures" for one class; takes OPAL credentials in the body, creates any newly found lectures as `pending`. Replaces the old unattended cron, which can't work with per-user client-side-only credentials. Subject to the per-user job cap — `429` if the caller already has a transcribe/detect/sync job running (see `docs/lectures.md`).
- `PATCH /api/classes/:classId` — update `name`, `opalCourseUrl`, `code`, `semester`, and/or `year`
- `DELETE /api/classes/:classId` — delete class and all its lectures

Fields: `id`, `name`, `semester` (OU semester letter: `א` | `ב` | `ג`), `year`, `opalCourseUrl`, `code` (OPAL course code, e.g. `10493`).

## Web

- Pages: classes list (`/classes`), class detail (`/classes/[classId]`)
- See [classes.md](../../open-uni-recorder-web/docs/classes.md)
