# OPAL Detection

Detects new lectures on an OPAL course page using Playwright. Used by the pipeline and the manual sync flow.

## API

- Module: `DetectModule`
- Service: `DetectService`
- Called by `PipelineService.runFullPipeline()` and `PipelineController POST /api/classes/sync`

**Flow:**
1. Launches Playwright browser, logs in to OPAL with `OPENU_USERNAME` / `OPENU_PASSWORD` / `OPENU_ID`
2. Navigates to the class's `opalCourseUrl`
3. Scrapes lecture list; compares against existing lectures in storage
4. Returns only lectures not already in the DB

**`POST /api/classes/sync` (SSE)** — runs detection for all classes with `opalCourseUrl` set, streams progress events per class. Does not insert anything — returns new lectures for the user to queue manually.

**Gotcha:** requires a class to have `opalCourseUrl` set. Classes without it are silently skipped.

## Web

- Settings page — "בדוק הרצאות חדשות" sync panel; shows new lectures with queue/skip buttons per class
- See [settings.md](../../open-uni-recorder-web/docs/settings.md)
