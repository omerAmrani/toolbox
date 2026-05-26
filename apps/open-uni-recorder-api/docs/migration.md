# Migration: Frameworks Rebuild

Rebuilding `open-uni-recorder` from Express + static HTML to Next.js (web) + NestJS (API), with clean module structure on both sides. Package extraction into `packages/ui` and `packages/ai` comes after the frameworks are stable.

## Background

Current state:
- `open-uni-recorder-web` — Express server that serves static HTML files and proxies to the API
- `open-uni-recorder-api` — Express server, all logic in flat `lib/` files with no enforced boundaries

Target state:
- `open-uni-recorder-web` — Next.js app, React components, calls NestJS directly via HTTP
- `open-uni-recorder-api` — NestJS app, logic split into feature modules with a clear utils/app-logic boundary

---

## How the Two Apps Communicate

The browser (client) calls the NestJS API directly over HTTP — there is no Next.js API layer in between.

```
Browser
  └── fetch("http://localhost:3001/api/classes")
        └── NestJS (port 3001)
```

- **Client Components** (run in the browser) call NestJS via `fetch` to `NEXT_PUBLIC_API_URL`.
- **Server Components** (run on the Next.js server) can also call NestJS via `fetch` — same HTTP, just server-to-server, no CORS needed.
- No Next.js Route Handlers acting as a proxy. The NestJS API is the only API.

NestJS must have CORS enabled for the Next.js origin in dev (`http://localhost:3000`).

---

## Turbo Pipeline

Turbo is the build orchestrator for the monorepo. The current `turbo.json` has:

```json
"build": { "dependsOn": ["^build"] }
```

`^build` means: **build all workspace dependencies first**. The `^` prefix means "upstream packages."

Once `packages/ui` has a `build` script, the chain becomes:

```
packages/ui#build
  └── apps/open-uni-recorder-web#build (Next.js depends on compiled packages/ui)
```

Turbo figures this out from `package.json` dependencies — if `open-uni-recorder-web` lists `@toolbox/ui` as a dependency, Turbo runs `@toolbox/ui#build` before the web build automatically.

For `dev`, there is intentionally no `^build` dependency (dev tasks are `persistent: true` and run in parallel). This means during dev, `packages/ui` must run in watch mode simultaneously so Next.js picks up changes. When that phase arrives, the dev command will be:

```bash
turbo run dev --filter=@toolbox/open-uni-recorder-web --filter=@toolbox/ui
```

NestJS has its own build step (`tsc`), but it only matters for production. In dev, `ts-node` or `nest start --watch` handles it.

---

## NestJS Module Boundary Rule

**Utils module** — stateless, no DB, no external services, pure logic. Can be imported by any other module.
Examples: `WhisperModule`, `PromptModule`, `DownloadModule`, `ExtractModule`

**App logic module** — owns a domain, touches DB or external AI services, has its own controller + service + repository.
Examples: `LecturesModule`, `ClassesModule`, `PipelineModule`, `JobsModule`

Rule: app logic modules can import utils modules. Utils modules never import app logic modules.

---

## Phases

### Phase 1 — NestJS scaffold (API)

Replace the Express server with NestJS. No logic changes — port existing flat files into the NestJS structure as-is. Goal is a running NestJS server with all existing endpoints working.

**Tasks:**
- Init NestJS app in `apps/open-uni-recorder-api` (replace `server.js`)
- Configure `AppModule`, enable CORS for `localhost:3000`
- Create a single `LecturesModule` with a controller that maps all existing Express routes
- Wire `better-sqlite3` db connection via a provider (no ORM)
- Move `src/jobs.js` (cron) into a NestJS `JobsModule` using `@nestjs/schedule`
- Set `"type": "commonjs"` in `package.json` (NestJS requires CJS; all internal `lib/` imports use `require`)
- Add `build` and `start:prod` scripts

**Done when:**
- `turbo run dev --filter=@toolbox/open-uni-recorder-api` starts without errors
- All existing API endpoints respond correctly (manually test each route)
- Cron job triggers on schedule

---

### Phase 2 — Next.js scaffold (Web)

Replace the Express static server + proxy with a Next.js app. No new UI yet — replicate the existing pages as-is using Next.js pages router or app router, with inline styles or direct CSS imports. Goal is a running Next.js app that calls the NestJS API.

**Tasks:**
- Init Next.js app in `apps/open-uni-recorder-web`
- Set `NEXT_PUBLIC_API_URL=http://localhost:3001` in `.env.local`
- Create one page per existing HTML file (`/classes`, `/class/[id]`, `/lecture/[id]`, `/settings`)
- Each page fetches from `NEXT_PUBLIC_API_URL` — no mock data
- Port `status.js` polling logic into a React hook (`useJobStatus`)
- Move existing CSS files into the Next.js app (as CSS modules or global styles — your choice)

**Done when:**
- `turbo run dev` starts both apps
- All four pages render with real data from NestJS
- Job status polling works on the lecture page
- No console errors

---

### Phase 3 — NestJS module split (API)

Reorganize the single flat module from Phase 1 into proper feature modules with clear boundaries.

**Module map:**

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
| `StorageModule` | utils | DB access layer (wraps better-sqlite3) |

**Done when:**
- Each module lives in `src/modules/<name>/`
- No cross-boundary imports that violate the utils/app-logic rule
- All endpoints from Phase 1 still work
- `StorageModule` is the only place that imports `better-sqlite3`

---

### Phase 4 — React component library (Web)

Identify UI patterns that repeat across pages and extract them into proper React components within the Next.js app first, then promote to `packages/ui` only what is genuinely reusable across apps.

**Tasks within the Next.js app:**
- Extract shared layout (`AppShell`, `Sidebar`, `PageHeader`)
- Extract data display components (`LectureCard`, `ClassCard`, `StatusBadge`, `PipelineProgress`)
- Extract form controls used in settings

**Promote to `packages/ui` only if:**
- The component has zero dependency on Next.js-specific APIs (`useRouter`, `Link`, etc.)
- It would be useful in `macro-chat` or another future app

**`packages/ui` setup when it gets real content:**
- Add `tsup` for building: `"build": "tsup src/index.ts --format cjs,esm --dts"`
- Export from `src/index.ts`
- Update `turbo.json` outputs to include `dist/**`
- Add `@toolbox/ui` as a dependency in `open-uni-recorder-web`

**Done when:**
- Pages compose components instead of raw HTML
- `packages/ui` (if anything was promoted) builds cleanly and is imported by the web app
- No visual regressions on any page

---

### Phase 5 — Package extraction (AI backends)

Extract the AI backend wrappers (`summarize-*.js`, `whisper-*.js`, `prompt.js`) into `packages/ai` if and only if `macro-chat` or another app needs them.

**Skip this phase until a second app actually needs the code.**

---

## Completion Criteria (full migration done)

- `turbo run dev` starts both apps, all pages work, cron runs
- `turbo run build` succeeds for both apps with no errors
- `turbo run check-types` passes (TypeScript added in Phase 1 and 2)
- NestJS has no module that violates the utils/app-logic boundary
- Next.js has no page that constructs raw HTML strings
- `packages/ui` either has real components with a passing build, or is still a stub (no half-finished state)
- `.env.example` files updated for both apps