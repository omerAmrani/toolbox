# open-uni-recorder-api

NestJS API, port 3001. TypeScript, `better-sqlite3` (no ORM), `@nestjs/schedule`.

## Module boundary rule

Two module types — never violate the boundary:
- **Utils** (no DB, no external AI): `StorageModule`, `DetectModule`, `DownloadModule`, `WhisperModule`, `SummarizeModule`, `EmailModule`, `QaModule`
- **App logic** (owns a domain, may use DB + AI): `ClassesModule`, `LecturesModule`, `PipelineModule`, `JobsModule`

App logic → utils: allowed. Utils → app logic: never.

## Config

Single entrypoint: `src/config.ts` — dotenv + exports. Import from there, not from `process.env` directly. Key vars: `SUMMARIZE_BACKEND`, `OUTPUT_LANG`, `OPENU_USERNAME/PASSWORD/ID`, `GMAIL_*`.

## Data storage

SQLite DB + filesystem mirror. Every write goes to both:
- DB: source of truth for queries
- `data/classes/<classId>/lectures/<lectureId>/meta.json`: filesystem backup, also where `transcript.txt`, `audio.mp3`, `qa.json`, and summary files live

## On startup

`resetStuckProcessing()` runs in `AppModule` — sets any `processing` lecture back to `failed` (guards against mid-job server restarts).

## Before implementing a feature

For non-trivial changes, check `docs/` for relevant context first:
- `docs/pipeline.md` — full pipeline flow, cron, queue runner
- `docs/lectures.md` — transcribe/summarize SSE endpoints, Q&A flow, lecture statuses

## Code quality rules

**External API clients — always lazy.** Never instantiate SDK clients (Groq, Anthropic, GoogleGenerativeAI, etc.) at module scope or in a constructor. Create them inside the method that uses them. SDK constructors validate keys at construction time — module-scope instantiation turns a missing env var into a service crash at boot.

**Think through failure modes before writing.** For any new integration or service: what happens if the key is missing? What if the external call fails mid-stream? What if the service restarts mid-job? Answer these before touching code, not after.

**If a design pattern or external SDK behaviour is unclear — ask before implementing.** Do not guess and fix later.

**Edge cases to always consider:**
- Missing or undefined env vars at runtime
- External API rate limits and transient failures
- Service restart mid-operation (see `resetStuckProcessing`)
- Empty or malformed inputs at every service boundary

## Tests

Integration tests live in `test/`. Run with `pnpm test` (uses `NODE_ENV=test`, `--runInBand`).

When adding or changing a feature, update the relevant test file in `test/` alongside the doc in `docs/`. Both must stay in sync with the code.
