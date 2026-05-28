# Design Handoff Integration — State

Living tracker for the visual-layer migration of `open-uni-recorder-web` to
the design system in `handoff/`. Updated as decisions are made.

Last updated: 2026-05-28

---

## Locked decisions

| # | Decision | Source |
|---|----------|--------|
| A | Single palette: `paper` only. No palette switcher, no `data-palette` attribute. | user |
| B | Single density: `regular` only. No density switcher, no `data-density` attribute. | user |
| C | Class detail: **table layout only**. Drop card-timeline view and `.layout-toggle`. | user |
| D | Lecture detail: **split layout only**. Drop centered view and toggle. | user |
| 1 | Keep current routes: `/classes`, `/classes/[classId]`, `/classes/[classId]/lectures/[lectureId]`. Ignore handoff README's `/c/[id]/l/[id]`. | user |
| 5 | Render Hebrew semester via existing `SEMESTER_HE` map from `lib/status.ts`. | user |
| 6 | `/setup` page: **build static UI only** (option 6b). No backend wiring, no middleware redirect. → backend-attach todo. | user |
| 7 | Settings `AccountCard`: **build static**. → backend-attach todo. | user |
| 8 | `/stats` page: calculate what we can from `/api/classes` + lecture statuses. For metrics we can't compute, render an explicit placeholder. → backend-attach todo for the rest. | user |
| 9 | Settings cards: keep current ones (Detect-new sync, AI models / health) and add **static** versions of design-suggested cards (notifications, storage, queue). → backend-attach todo. | user |
| 10 | Remove "+ הרצאה" manual-add button from UI. Keep `POST /api/classes/:classId/lectures` in backend. → docs/todo. | user |
| 11 | `NewCourseModal` URL field maps to `opalCourseUrl`. | user |
| 12 | Tailwind: **deferred**. Use `handoff/design-system.css` as-is for the migration; Tailwind migration becomes a future todo. | user |
| 4a | Lecture number `n` → derive from lecture date (chronological order within class). | user |
| 2 | **Extend** `Status` component to cover all 11 API statuses, reusing Hebrew labels + colors from `lib/status.ts`. | user |
| 4b | `current` highlight → **derive**: lecture in `transcribing/summarizing/processing` is current; else no highlight. | user |
| 4c | `duration` → **drop from UI**. Backend may compute later. → backend-attach todo. | user |
| 13 | `<AppShell>` is a small client wrapper; `app/layout.tsx` stays a server component. Confirmed standard Next.js practice. | user |
| T | **Use `design-system.css` plain** for the migration. Tailwind migration is a future todo, not part of this work. | user |
| 3a | Class `code` (e.g. `20109`): **stub for now**, fill from OPAL metadata later. → backend-attach todo. | user |
| 3b | Class `color`: **random from a small color set** on create, persist locally. | user |
| 3c | Class `icon`: **first char of name**. | user |
| 3d | Class `archived`: **UI-stub via localStorage**. → backend-attach todo. | user |
| 3e | Home "hours saved" tile: **remove**. → backend-attach todo (depends on `duration` from #4c). | user |
| 3f | Class card sort: **recently-active** (most recent lecture activity first). | user |
| 3g | `NewCourseModal` fields: **name, URL, semester, year** — all required at UI level (semester/year still optional in API). | user |
| 3h | Empty state: headline `"עדיין אין קורסים"`, CTA `"+ קורס חדש"` opens `NewCourseModal`. | proposed |
| 4d | Class detail table columns: **n, date, name, status, actions** (no duration). | user |
| 4e | Row actions: **delete, skip (API), archive (UI-stub), summarize, retry-when-failed**. Transcribe stays off the row (SSE complexity). | user + assistant |
| 4f | Whole row clickable → `/classes/[classId]/lectures/[lectureId]`. | user |
| 4g | Keep current job-status polling for in-flight lectures. | user |
| 4h | Class header: name, semester+year, editable `opalCourseUrl`, **total lectures count**, **summarized count**, actions (sync now, archive class, delete class). | user |

---

## Open questions (waiting on user)

### 14 — Q&A SSE shape

Have not read `apps/open-uni-recorder-api/docs/qa.md` yet. Need to before
Phase 5 to confirm the existing `QASection` re-wrap doesn't break event
handling. Read now or as part of Phase 5 prep?

### 15 — Summary markdown wrap

Plan wraps `marked` output in `<div class="summary">`. Need to confirm the
current render path tolerates an extra wrapper (no sanitizer/className
clash). Verify now or during Phase 5?

### 16 — Palette/density persistence

Likely moot given A + B (single palette, single density locked). Confirming
I hardcode `<html lang="he" dir="rtl">` only — no `data-palette`,
`data-density`, no persistence layer. Confirm to close.

### 17 — Docs update cadence

Project CLAUDE.md says update `apps/open-uni-recorder-web/docs/` when
features change.

- **17a** — Update per phase (alongside each commit).
- **17b** — Batch at end of Phase 9.

### 18 — PR / commit strategy

- **18a** — Single branch, one commit per phase, single PR at the end.
- **18b** — One PR per phase (small reviews, more overhead).
- **18c** — Commit straight to `main` (matches recent repo activity).

### 19 — Verification cadence

- **19a** — `pnpm turbo run build --filter=@toolbox/open-uni-recorder-web`
  + browser smoke test after every phase.
- **19b** — Only at end of Phase 9.
- **19c** — Typecheck per phase, full build + browser at end.

### 20 — Fate of existing local components

`app/components/` has: `NavBar`, `PageHeader`, `Modal`, `Toast`,
`StatusBadge`, `BackendSelect`, `EmptyState`, `QASection`.

- **20a** — Replace/delete as new ones land (cleaner final, more churn).
- **20b** — Keep alongside until all pages ported; delete in Phase 9.
- `QASection` and `BackendSelect` are feature components, not chrome —
  expectation is they survive. Confirm.

---

## Phases (from `handoff/INTEGRATION.md`, adapted to locked decisions)

| Phase | Description | Status |
|---|---|---|
| 0 | Preflight: Tailwind audit, route map | not started |
| 1 | Tokens + global shell (`AppShell`, `Sidebar`, `Topbar`, fonts, RTL) | not started |
| 2 | `Status` component + small primitives | not started |
| 3 | Classes home (`/classes`) — grid + glance stats + `NewCourseModal` w/ URL | not started |
| 4 | Class detail (`/classes/[classId]`) — **table only** (C) | not started |
| 5 | Lecture detail — **split only** (D), Q&A SSE wired, reading progress bar | not started |
| 6 | `/stats` — derived metrics + placeholders for missing data (8) | not started |
| 7 | `/settings` — keep current cards + add static design-suggested cards (9) + static `AccountCard` (7) | not started |
| 8 | `/setup` — static 3-step UI, no backend, no middleware redirect (6) | not started |
| 9 | Cleanup: remove "+ הרצאה" UI (10), drop old style files, `next build`, mobile QA | not started |

---

## Backend-attach todos (for after the visual migration)

These are the "static now, wire later" items the user explicitly flagged:

- [ ] Wire `/setup` 3-step flow to a real auth/credentials API. Add a
      middleware redirect once `account.connected` exists.
- [ ] Wire Settings `AccountCard` to a real account endpoint.
- [ ] Wire Settings notifications / storage / queue cards to real APIs
      (or remove if we decide not to build them).
- [ ] `/stats`: replace placeholder metrics with a real stats endpoint for
      data we cannot compute client-side (e.g. per-model latency, queue
      depth over time, model usage breakdown).
- [ ] Decide fate of `POST /api/classes/:classId/lectures` (manual add).
      It stays in the backend but is unreachable from UI as of Phase 9 (10).
- [ ] Backfill class `code` from OPAL metadata (currently stubbed, #3a).
- [ ] Add backend `archived` field on classes (currently localStorage,
      #3d).
- [ ] Add backend lecture `archive` concept (currently localStorage-stub
      row action, #4e). Decide if this is just `skip` under a new name or
      a distinct state.
- [ ] Add `duration` to the lecture record (server-side audio metadata
      read), then surface in UI (#4c) and restore the home "hours saved"
      tile (#3e).
- [ ] **Tailwind migration** — port design tokens to `tailwind.config.ts`
      and rewrite components in Tailwind classes; delete
      `handoff/design-system.css` once parity is verified (#12, T).

---

## API ground truth (validated against `apps/open-uni-recorder-api/docs/`)

- **Class** fields: `id`, `name`, `semester` (`spring|summer|fall|winter`),
  `year`, `opalCourseUrl`, `lectureCount`. **No** `code`, `color`, `icon`,
  `archived`.
- **Lecture** fields: `id`, `name`, `lectureDate`, `status`, file artifacts.
  **No** lecture number `n`, **no** `current`, **no** `duration` exposed.
- **Statuses** (full set): `pending | transcribing | transcribed |
  summarizing | summarized | done | failed | aborted | skipped | error |
  processing`.
- **SSE shapes**: `{type:'progress',step,message}`, `{type:'token',token}`,
  `{type:'done'}`, `{type:'error'|'aborted',message}`.
- **No auth API.** OPENU access is via env vars on the server. Any
  account/setup UI is currently disconnected from reality.
- **No metrics/queue endpoint.** Stats must be derived or stubbed.
