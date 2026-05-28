# Phases 1–4 Execution Plan

Self-contained handoff for the next chat. Read this file plus
`handoff/STATE.md` (decisions log) and `handoff/INTEGRATION.md`
(original generic plan) before starting.

Working dir: `apps/open-uni-recorder-web/`.

---

## Context you must have first

1. Read `handoff/STATE.md` end-to-end. It contains the locked decisions
   (A, B, C, D, 1–13, T, 2, 3a–3h, 4a–4h, etc). Do not re-litigate them
   without asking.
2. Read `handoff/CLASSES.md` (CSS class cheat sheet) and skim
   `handoff/reference/components.jsx` + `handoff/reference/screens.jsx`
   for the visual reference markup. **Do not import these reference
   files** — they are JSX with mock data; port the patterns into TSX.
3. The app's API is at `apps/open-uni-recorder-api`. Use `lib/api.ts`'s
   `apiUrl()` for every fetch — never hardcode `localhost:3001`.
4. SSE event shapes are in `apps/open-uni-recorder-api/docs/lectures.md`.
   `lib/sse.ts` is the existing consumer helper.
5. Status labels/colors already live in `lib/status.ts` — extend the new
   `<Status>` component to reuse `STATUS_LABEL`/`STATUS_COLOR` rather
   than duplicating.

---

## Cross-phase ground rules

- **Single palette `paper`, single density `regular`.** Do NOT add
  `data-palette`, `data-density`, or any palette/density switcher. The
  `<html>` tag gets `lang="he" dir="rtl"` only.
- **Plain CSS (`design-system.css`) is the source of truth.** No
  Tailwind work in this round. (Migration to Tailwind is a future todo,
  see STATE.md "Backend-attach todos".)
- **Class detail uses the table layout only.** No card-timeline view, no
  `.layout-toggle`.
- **Lecture detail uses the split layout only.** (Out of scope for
  Phases 1–4 but referenced for context.)
- **Keep existing routes:** `/classes`, `/classes/[classId]`,
  `/classes/[classId]/lectures/[lectureId]`, `/settings`.
- **Verification.** Run typecheck per phase
  (`pnpm turbo run typecheck --filter=@toolbox/open-uni-recorder-web`
  or local equivalent). Full `next build` + browser smoke at the end of
  Phase 4. If the project's CLAUDE.md or scripts dictate otherwise,
  follow those.
- **Old `app/components/`** (`NavBar`, `PageHeader`, `Modal`, `Toast`,
  `StatusBadge`, `BackendSelect`, `EmptyState`, `QASection`): keep
  alongside until all pages are ported. Delete in Phase 9 (later). For
  Phases 1–4, replace usages as you re-render each page but do NOT
  delete the files yet. `QASection` and `BackendSelect` are expected to
  survive.
- **Confirm-before-destroy.** Per repo CLAUDE.md, ask before committing
  to git. Do not push, do not amend, do not force-push.
- **localStorage stubs.** For class `color`, class `archived`, lecture
  `archived`. Key naming convention: `our:class:<id>:color`,
  `our:class:<id>:archived`, `our:lecture:<id>:archived`. Document any
  keys you add so they're easy to clean up later.

---

## Phase 1 — Tokens + global shell

**Goal.** Replace global styles, add fonts, build the persistent shell
(`<Sidebar>` + `<Topbar>`) so every page renders inside the right-aligned
RTL grid.

### Files

- **Replace** `app/globals.css` ← copy `handoff/design-system.css`
  verbatim. Do NOT keep both — overwrite. (Old custom CSS classes used by
  legacy components may break visually; that's expected and gets fixed
  as we port each page in Phases 3+.)
- **Modify** `app/layout.tsx`:
  - Set `<html lang="he" dir="rtl">` (no `data-palette`,
    no `data-density`).
  - Add Google Fonts `<link>` tags inside `<head>` (the three families
    from `handoff/README.md` step 2: Frank Ruhl Libre, Heebo,
    JetBrains Mono).
  - Wrap `{children}` in `<AppShell>` (see below).
- **Create** `app/components/AppShell.tsx` (client component):
  ```tsx
  'use client';
  import Sidebar from './Sidebar';
  import Topbar from './Topbar';
  export default function AppShell({ children }: { children: React.ReactNode }) {
    return (
      <div className="app">
        <Sidebar />
        <main className="main">
          <Topbar />
          {children}
        </main>
      </div>
    );
  }
  ```
- **Create** `app/components/Sidebar.tsx` (client) — port from
  `handoff/reference/components.jsx > Sidebar`. Use `usePathname()` for
  active-route highlight. Sidebar's class list comes from real
  `/api/classes` (fetch client-side or lift fetch to `AppShell`; a
  client-side `useEffect` fetch is fine for Phase 1 — we'll revisit if
  it hurts perf).
- **Create** `app/components/Topbar.tsx` — port from
  `reference/components.jsx > Topbar`. Accept a `crumbs` prop (default
  derived from `usePathname()` if not passed; pages can override).

### Acceptance

- Visiting `/classes`, `/classes/[classId]`,
  `/classes/[classId]/lectures/[lectureId]`, `/settings` shows the new
  sidebar on the right and topbar at the top, even if page content
  inside is unstyled or broken.
- RTL is on. Fonts load (verify via DevTools → Network → fonts).
- No console errors from the shell.
- Typecheck passes.

---

## Phase 2 — `<Status>` component + small primitives

**Goal.** A single source of truth for status pills, covering all 11
statuses our API emits.

### Files

- **Create** `app/components/Status.tsx`. Export:
  - `Status({ s }: { s: string })` — renders
    `<span class="status" data-s={s}>...</span>` per design.
  - `fmtDate(iso: string)` — short Hebrew date helper.
  - `fmtDateLong(iso: string)` — long form for lecture pages.
- Use the existing `STATUS_LABEL` map from `lib/status.ts` (it already
  has Hebrew for all 11 states). If the design's `--st-*` tokens don't
  cover the extras (`processing`, `done`, `failed`, `aborted`,
  `skipped`), add CSS variables in `app/globals.css` for them. Mapping:
  - `processing` → same color as `transcribing`
  - `done` → same as `summarized`
  - `failed` → same as `error`
  - `aborted` → muted
  - `skipped` → muted
- **Modify** call sites: every `<StatusBadge>` in the app becomes
  `<Status s={...}>`. Leave `app/components/StatusBadge.tsx` on disk for
  now (Phase 9 deletes it).

### Acceptance

- Rendering `<Status>` with any of the 11 statuses produces a styled
  pill with the right Hebrew label and color.
- `Summarizing` pulses (per `.status[data-s="summarizing"]` keyframes
  from `design-system.css`).
- Typecheck passes.

---

## Phase 3 — Classes home (`app/classes/page.tsx`)

**Goal.** Replace the home page markup with the design's grid + glance
strip + new-course modal. Keep all data fetching.

### Files

- **Modify** `app/classes/page.tsx`. Use classes: `display-h`, `glance`,
  `semester-strip`, `class-grid`, `class-card`. Reference markup:
  `handoff/reference/screens.jsx > ClassesScreen`.
- **Create/replace** `NewCourseModal` (likely in
  `app/components/NewCourseModal.tsx`). Fields:
  - `name` (required)
  - `opalCourseUrl` (required at UI level — API treats as optional)
  - `semester` (required UI-level — API optional; use `SEMESTER_HE`
    options: `spring|summer|fall|winter` values, Hebrew labels)
  - `year` (required UI-level — API optional; numeric input or year
    select for current ± 5)
  Submit `POST /api/classes` via `apiUrl()`. On success, refresh list and
  close modal.
- **"+ new course" tile**: a `.class-card` styled placeholder at the end
  of `.class-grid` that opens `NewCourseModal`.
- **Glance strip (3 tiles, not 4):**
  - `summarized count` — sum of lectures in `summarized` or `done`
    across all classes.
  - `pending count` — sum of lectures in `pending` across all classes.
  - `needing attention` — sum of lectures in `failed | error | aborted`.
  - **Do NOT render an "hours saved" tile.** Leave a `// TODO:` comment
    referencing STATE.md backend-attach todo for restoring it once
    `duration` exists on lectures.
- **Class card visuals:**
  - `code` — stub. Show empty or a literal `—` for now; flag with
    `// TODO:` comment.
  - `color` — random pick from `['sage', 'amber', 'plum', 'ink']` on
    first render, persisted to `localStorage` key
    `our:class:<id>:color`. Add a `getClassColor(id)` helper.
  - `icon` — first character of `name` (uppercased; handle Hebrew chars
    correctly — Hebrew "א" is fine without case ops).
  - `archived` — read from `localStorage` key
    `our:class:<id>:archived`. Filter archived classes out of the
    default grid view; consider an "archived" reveal later (out of
    scope now — leave the toggle off and add a `// TODO`).
- **Sort order:** by recently-active. Definition for this phase: derive
  from the latest `lectureDate` per class (you'll need lecture data —
  either rely on an existing `lectureCount`/`lastActivity` field if the
  API has it; if not, fetch `/api/classes/:classId/lectures` for each
  class in parallel on the home page is too heavy. **Practical fallback
  for Phase 3:** sort by `year` desc → `semester` desc → `name`. Add a
  `// TODO:` referencing #3f and the need for a `lastLectureAt` field
  on the API. Note this in STATE.md backend-attach todos.
- **Empty state:** headline `"עדיין אין קורסים"`, CTA `"+ קורס חדש"`
  opening `NewCourseModal`.

### Acceptance

- `/classes` renders the design layout. Existing data fetching still
  works. Creating a course via the modal hits `POST /api/classes` and
  the new card appears.
- Each card has a stable color across reloads (localStorage works).
- Glance tiles show correct counts.
- Empty state renders correctly when zero classes.
- Typecheck passes.

---

## Phase 4 — Class detail (`app/classes/[classId]/page.tsx`)

**Goal.** Table-only lecture list under a class header. Preserve job
status polling and SSE-triggering actions.

### Files

- **Modify** `app/classes/[classId]/page.tsx`. Reference markup:
  `handoff/reference/screens.jsx > ClassDetailScreen` (use only its
  `TableView` sub-component pattern; ignore `TimelineView`).
- **Class header section:**
  - Class name (display font: Frank Ruhl Libre via design classes).
  - `code` (stub for now).
  - `semester` + `year` rendered via `SEMESTER_HE` map.
  - Editable `opalCourseUrl` — inline edit (click to edit, blur to save
    via `PATCH /api/classes/:classId`).
  - Counters: `total lectures` and `summarized lectures`. Summarized =
    statuses in `{summarized, done}`.
  - Class-level actions: **Sync now** (`POST /api/classes/sync` — note:
    this is an SSE endpoint per `detect.md`; this class's URL must be
    set; if your endpoint requires a single class id, follow whatever
    pattern the existing page used pre-refactor), **Archive class**
    (localStorage toggle, see Phase 3 stub), **Delete class**
    (`DELETE /api/classes/:classId` — confirm modal).
- **Table:**
  - Columns: `n`, `date`, `name`, `status`, `actions`.
  - `n` (lecture number) is derived: sort lectures by `lectureDate` asc,
    `n = index + 1`. Compute once per render.
  - `date` rendered via `fmtDate` from Phase 2.
  - `status` rendered via `<Status>` from Phase 2.
  - **No `duration` column.** (#4c locked: drop from UI.)
  - **Whole row clickable** → navigate to
    `/classes/[classId]/lectures/[lectureId]`. Action buttons in the
    last column must `stopPropagation` to avoid double-navigating.
  - **`data-current`** on the row whose status is in
    `{transcribing, summarizing, processing}`. CSS handles the
    highlight.
  - **Empty state** when class has zero lectures.
- **Row actions** (rightmost column, icons or short labels):
  - **Summarize** — `POST .../summarize` (SSE). The button should kick
    off the SSE and reflect the resulting status changes via the same
    job-polling mechanism the page already uses. If currently
    `summarizing`, show "Abort" instead which calls
    `POST .../abort` with `{ type: 'summarize' }`.
  - **Skip** — `POST .../skip` (API).
  - **Archive** — localStorage toggle (UI-stub for #4e). Use key
    `our:lecture:<id>:archived`. Filter archived rows out by default;
    same TODO note as class archive.
  - **Retry** — only when status is `failed`. `POST .../retry`.
  - **Delete** — `DELETE .../lectures/:lectureId`. Confirm modal.
  - **No transcribe button on the row.** Transcribe lives on the
    lecture detail page (out of scope for Phase 4).
- **Job status polling:** Keep the existing polling logic exactly as-is.
  It already updates status fields via periodic refetch; the new table
  re-renders correctly from the same source.
- **Manual "+ הרצאה" button:** removed from UI per #10 locked. Backend
  route `POST .../lectures` stays — no UI affordance.

### Acceptance

- `/classes/[classId]` renders the new header + table. Header counters
  are correct. Editing `opalCourseUrl` persists via PATCH.
- Clicking a row navigates to lecture detail.
- `data-current` highlight appears on in-flight lectures and animates.
- Each row action calls the correct API and updates UI state.
- Delete-class flow confirms then navigates back to `/classes`.
- Archived lectures don't appear in the default list (and the
  localStorage toggle persists).
- Typecheck passes. Full `next build` passes at end of Phase 4. Manual
  smoke test in browser at 390×844 mobile width.

---

## Things explicitly NOT in Phases 1–4 (do not start)

- `/stats` page (Phase 6).
- `/settings` reorder + AccountCard (Phase 7).
- `/setup` static 3-step UI (Phase 8).
- Lecture detail page rewrite (Phase 5).
- Deleting old `app/components/*` files (Phase 9).
- Tailwind migration (future todo).
- Backend changes (class archived field, lecture archive concept,
  duration, class code backfill, lastLectureAt, stats endpoints).

---

## When you finish Phase 4

1. Update STATE.md "Phases" table: Phase 1–4 marked done.
2. Append any new backend-attach todos you discovered while working.
3. Ask the user before committing. Suggest one commit per phase if they
   haven't already chosen a PR strategy (#18 open).
4. Don't start Phase 5 without re-syncing with the user — there are
   pending small questions (#14 Q&A SSE shape, #15 summary sanitizer
   wrap) that need to be resolved first.

---

## Open questions still unresolved (informational)

These do not block Phases 1–4 but the user should be reminded:

- #14 Q&A SSE shape (Phase 5 prep)
- #15 Summary markdown wrap (Phase 5 prep)
- #16 Palette/density persistence (confirm to formally close)
- #17 Docs update cadence
- #18 PR / commit strategy
- #19 Verification cadence
- #20 Final disposition of old `app/components/*`
- #4e clarifier: whether lecture "archive" is the existing `skip` or a
  net-new backend concept (currently treated as UI-stub).

See STATE.md for the full text.
