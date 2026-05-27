# Migration: Frameworks Rebuild

Express + static HTML → Next.js (web) + NestJS (API).

## Current State (2026-05-27)

- `open-uni-recorder-api` — NestJS, TypeScript, `@nestjs/schedule`, `better-sqlite3` (no ORM). Phase 1 done.
- `open-uni-recorder-web` — Next.js 15, App Router, TypeScript, port 3002. Phase 2 scaffold done.

## Architecture

Browser calls NestJS directly — no Next.js API proxy layer.

```
Browser → fetch(NEXT_PUBLIC_API_URL) → NestJS :3001
```

NestJS has CORS enabled for `http://localhost:3000` (and `3002` in dev).

## NestJS Module Boundary Rule

**Utils module** — stateless, no DB, no external services. Can be imported by anything.
Examples: `WhisperModule`, `PromptModule`, `DownloadModule`, `ExtractModule`

**App logic module** — owns a domain, touches DB or external AI. Has controller + service.
Examples: `LecturesModule`, `ClassesModule`, `PipelineModule`, `JobsModule`

Rule: app logic → utils allowed. Utils → app logic never.

---

## Phases

### Phase 1 — NestJS scaffold ✅ (2026-05-27)

- `src/main.ts` — bootstrap, CORS, dotenv
- `src/app.module.ts` — root module, `resetStuckProcessing()` on boot
- `src/app.controller.ts` — search, data-dir, reload-from-disk
- `src/modules/classes/` — all `/api/classes/…` routes, `activeJobs` + `activeAbortControllers` on the service
- `src/modules/health/` — groq, gemini, claude, ollama health checks
- `src/modules/jobs/` — `@nestjs/schedule` cron (`0 10 * * 4,5 Asia/Jerusalem`) + retry timer
- All `lib/` + `src/` files converted from ESM to TypeScript

---

### Phase 2 — Next.js scaffold ✅ (scaffold done)

- Next.js 15, App Router, port 3002
- Pages: `/classes`, `/classes/[classId]`, `/classes/[classId]/lectures/[lectureId]`, `/settings`
- Components: `NavBar`, `PageHeader`, `Modal`, `Toast`

**Remaining verification:**
- All pages render with real data from NestJS
- Job status polling works on the lecture page
- No console errors

---

### Phase 3 — NestJS module split

Split the flat `ClassesController` into proper feature modules.

| Module | Type | Owns |
|---|---|---|
| `LecturesModule` | app logic | lectures CRUD, lecture detail |
| `ClassesModule` | app logic | classes CRUD |
| `PipelineModule` | app logic | pipeline orchestration, job status |
| `JobsModule` | app logic | cron scheduling, auto-trigger |
| `WhisperModule` | utils | transcription backends |
| `SummarizeModule` | utils | summarization backends |
| `DownloadModule` | utils | video download, extract |
| `PromptModule` | utils | prompt templates |
| `StorageModule` | utils | DB access layer (only place that imports `better-sqlite3`) |

**Done when:** all endpoints still work, no cross-boundary violations.

---

### Phase 4 — React component library

Extract repeating UI into components in the Next.js app. Promote to `packages/ui` only if the component is Next.js-free and useful in a second app.

**`packages/ui` setup (when ready):** `tsup`, `src/index.ts`, update `turbo.json` outputs.

---

### Phase 5 — AI package extraction

Move `lib/backends/` into `packages/ai` only when a second app needs it. Skip until then.

---

## Completion Criteria

- `turbo run dev` starts both apps, all pages work, cron runs
- `turbo run build` succeeds for both apps
- `turbo run check-types` passes
- NestJS: no module boundary violations, `StorageModule` is the only `better-sqlite3` importer
- Next.js: no page constructs raw HTML strings
