# Integration plan for Claude Code

This is a suggested step-by-step plan to integrate the handoff into the
existing `open-uni-recorder-web/` Next.js codebase.

## Phase 0 — preflight

1. Check current Tailwind/CSS setup. If Tailwind is present, you can keep
   using it for layout edits inside components, but the design tokens and
   component classes from `design-system.css` should be the source of truth
   for visual styling.
2. Note the existing routes (likely `app/classes/page.tsx`,
   `app/classes/[classId]/page.tsx`, `app/classes/[classId]/lectures/[lectureId]/page.tsx`,
   `app/settings/page.tsx`). Map them to the screens listed in the README.

## Phase 1 — tokens + global shell (~30 min)

1. Replace `app/globals.css` content with `handoff/design-system.css`.
2. In `app/layout.tsx`:
   - Add `lang="he" dir="rtl" data-palette="paper" data-density="regular"`
     to `<html>`.
   - Add the Google Fonts `<link>` tags.
   - Create a shared `<AppShell>` client component that renders
     `<div class="app"><Sidebar/><main class="main"><Topbar/>{children}</main></div>`.
3. Create `app/components/Sidebar.tsx` and `app/components/Topbar.tsx` from
   `reference/components.jsx`. Wire them to `usePathname()` for active state.
4. Verify: visit any existing page. The shell should be visible even if the
   content inside looks unstyled.

## Phase 2 — Status + small primitives (~20 min)

1. Create `app/components/Status.tsx` exporting both `Status` and
   `STATUS_LABEL` and `fmtDate`/`fmtDateLong`.
2. Replace inline status badges in any existing component.

## Phase 3 — Classes (home) (~45 min)

1. Port `app/classes/page.tsx` markup to use `display-h`, `glance`,
   `semester-strip`, `class-grid`, `class-card` classes.
2. Wire `NewCourseModal` into the "+ new course" tile.
3. Keep the existing data fetching — just replace JSX.

## Phase 4 — Class detail (~60 min)

1. Port `app/classes/[classId]/page.tsx`.
2. Build the `TimelineView` and `TableView` sub-components.
3. Wire the `.layout-toggle` to local state (or persist to user prefs).
4. Verify navigation works: home card click → class detail → lecture click.

## Phase 5 — Lecture detail (~90 min)

1. Port `app/classes/[classId]/lectures/[lectureId]/page.tsx`.
2. The summary already uses `marked` — wrap output in `<div class="summary">`.
3. Implement the `.lec-progress` reading bar with a scroll listener.
4. Connect the Q&A widget to your existing SSE streaming endpoint.
5. Decide: centered vs split layout. Either user preference or a toggle.

## Phase 6 — Stats (new page) (~60 min)

1. Create `app/stats/page.tsx`.
2. The component is mostly self-contained — see `reference/screens.jsx > StatsScreen`.
3. The mock model usage data should come from your existing health/queue API.

## Phase 7 — Settings (~45 min)

1. Reorder the existing settings cards: detect-new / notifications /
   storage / queue / AI models (full width, at bottom).
2. Add the new `AccountCard` at the top.

## Phase 8 — Setup / Login (new) (~75 min)

1. Create `app/setup/page.tsx`. This page should NOT use the app shell —
   render `SetupScreen` directly.
2. Wire the 3 steps to your real auth/credentials API. Currently the
   reference uses `setTimeout` to simulate a connection test.
3. Add a middleware redirect: if no `account.connected`, redirect to `/setup`.

## Phase 9 — Cleanup

1. Delete any old style files / unused components.
2. Run `next build` — fix any TS issues.
3. Test on mobile (390×844 and 360×640).
4. Test all 4 palettes by editing `<html data-palette="...">`.

---

## Tips

- The reference files are JSX and use `MOCK.classes` etc. **Don't import these
  files into your app** — they're a visual reference. Copy the markup
  patterns into your TypeScript components.
- The Tweaks panel is dev-only. You can omit it for production, or keep it
  behind a `process.env.NODE_ENV !== 'production'` check.
- If something looks off, check that you have `dir="rtl"` on `<html>` and that
  the fonts loaded.
- The shell's mobile bottom nav assumes the first `.sb__section` contains
  home/stats/settings. If you reorganize, update the `:not(:first-of-type)`
  selector in the mobile breakpoint.
