# Open Uni Recorder — Design System Handoff

A complete design system for the lecture recorder/summarizer app, ready to drop
into the existing Next.js + TypeScript codebase. Hand this directory to Claude
Code and point it at `open-uni-recorder-web/` for integration.

**Stack assumptions:** Next.js 15 App Router, TypeScript, plain CSS (no
Tailwind). All HTML is RTL Hebrew. The current app at `open-uni-recorder-web/`
already has the data layer, API calls, and routing — this handoff is the
visual layer only.

---

## What's in this directory

```
handoff/
├── README.md              ← you are here
├── CLASSES.md             ← cheat sheet: every CSS class with usage
├── design-system.css      ← the full stylesheet, drop into app/globals.css
└── reference/
    ├── components.jsx     ← reference React markup (Sidebar, Topbar, Status, helpers)
    ├── screens.jsx        ← reference React markup for each screen
    └── mock-data.js       ← reference data shapes (for type definitions)
```

The `reference/` files are **JSX, not TSX, and use mock data**. They exist as a
visual+structural reference — copy markup patterns from them into your real
TypeScript components, wiring up to your real API.

---

## Quick start

### 1. Drop in the stylesheet

Replace (or merge into) `app/globals.css` with `design-system.css`. The file is
self-contained: design tokens, reset, every component class, full RTL support,
and responsive breakpoints for ≤720px (mobile bottom nav) and ≤420px (extra-small).

The first ~120 lines define CSS custom properties. To switch palettes globally:

```tsx
// in app/layout.tsx or a theme provider
<html lang="he" dir="rtl" data-palette="paper" data-density="regular">
```

Available palettes: `paper` (default cream/sage), `indigo` (original purple),
`night` (dark mode), `clay` (terracotta).

Available densities: `compact`, `regular` (default), `spacious`.

### 2. Add the fonts

Add this to `app/layout.tsx`:

```tsx
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
<link
  href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;700;800&family=Heebo:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
  rel="stylesheet"
/>
```

- **Frank Ruhl Libre** — display, summary reading (the warm serif feel)
- **Heebo** — all UI text (buttons, labels, nav)
- **JetBrains Mono** — codes, course numbers, timestamps, latency numbers

### 3. Port screens one at a time

Use `reference/screens.jsx` and `CLASSES.md` as a guide. Recommended order:

1. **Shared shell** (`Sidebar`, `Topbar`) — affects every page
2. **Classes (home)** — the entry experience
3. **Class detail** — has both card-timeline and table layouts
4. **Lecture detail** — the longest read, most layout decisions
5. **Stats** — new page; add a route at `/stats`
6. **Settings** — reorder existing cards + add `AccountCard`
7. **Setup** — new full-screen onboarding at `/setup`

---

## Design system at a glance

### Visual language

- **Reading-app calm.** Generous whitespace. Frank Ruhl Libre serif for any
  display or summary copy creates an "academic paper" feel.
- **Warm neutrals over cold ones.** Cream `#f6f2eb` background, ink-black
  `#1a1814` text, sage `#6a7d5b` accent. Avoids the SaaS-grey trap.
- **Discrete states, not gradients.** Status colors are flat. The few subtle
  gradients are reserved for highlighting the "currently active" lecture.
- **Type hierarchy via family + weight, not just size.** Switching from Heebo
  to Frank Ruhl Libre signals "this is content, slow down and read."

### The four palettes

Each palette swaps these CSS custom properties:

| Token       | Paper    | Indigo  | Night   | Clay    |
| ----------- | -------- | ------- | ------- | ------- |
| `--bg`      | cream    | grey    | near-black | sandstone |
| `--ink`     | warm black | navy | warm white | brown   |
| `--accent`  | sage     | indigo  | gold    | terracotta |

Toggle by setting `data-palette="..."` on `<html>`. All CSS uses tokens, so the
whole UI restyles atomically.

### Densities

`data-density="compact"` reduces gap/padding tokens by ~35%. `spacious`
increases them by ~40%. Useful for users with different screen sizes or
preferences. Same token swap pattern.

---

## Architectural notes for integration

### Layout shell

`app/layout.tsx` (or a wrapping client component) should render `.app`:

```tsx
<body>
  <div className="app">
    <Sidebar route={pathname} />
    <main className="main">
      <Topbar crumbs={...} />
      {children}
    </main>
  </div>
</body>
```

The `.app` grid handles the right-aligned RTL sidebar. On mobile, CSS
auto-collapses the sidebar to a fixed bottom nav.

**Exception:** the Setup screen (`/setup`) should bypass the app shell — render
it directly as a full-screen page with no `.app` wrapper. See
`reference/screens.jsx > SetupScreen`.

### Status component

Lecture statuses are: `pending | transcribing | transcribed | summarizing |
summarized | error`. Each gets a color in `:root` (`--st-*`) and a Hebrew label
in `STATUS_LABEL`. Use:

```tsx
<Status s={lecture.status} />
```

### Animations

Pulsing dots, shimmering streaming boxes, fade-up on screen mount — all done
with CSS `@keyframes`. No JS animation library needed. They're scoped to:

- `.lec-card[data-current]` and `.tl-item__dot` — currently-active lecture
- `.status[data-s="summarizing"]` — pulsing dot for in-flight work
- `.streaming` — shimmer effect when AI is generating
- `.fade-in` — apply to any screen root for a subtle mount transition

### Tweaks panel

The reference HTML uses an in-page `<TweaksPanel>` for designers to toggle
palette/density/layout live. In production, this becomes a real user setting:

- **Palette** → user preference, persist to your existing settings store
- **Density** → user preference
- **Class layout (cards vs table)** → either user preference, or local state
  with a toggle button on the page (it's already there: `.layout-toggle`)
- **Lecture layout (centered vs split)** → same

You can keep `<TweaksPanel>` in dev mode and remove for production, or omit
entirely.

---

## Data shape reference

See `reference/mock-data.js` for the full shape. Key types you'll want as TS:

```ts
type Status = 'pending' | 'transcribing' | 'transcribed'
            | 'summarizing' | 'summarized' | 'error';

interface Lecture {
  id: string;
  n: number;          // lecture number, e.g. 6
  name: string;       // "אינטגרציה בחלקים"
  date: string;       // ISO date
  status: Status;
  duration: number | null;  // minutes
  summary?: string;   // markdown
  current?: boolean;  // highlight in lists
}

interface Class {
  id: string;
  code: string;       // "20109"
  name: string;       // "חשבון אינפיניטסימלי 1"
  semester: 'אביב' | 'חורף' | 'קיץ' | 'סתיו';
  year: number;
  color: 'sage' | 'amber' | 'plum' | 'ink';
  icon: string;       // single char or short string for the card mark
  archived?: boolean;
  lectures: Lecture[];
}

interface University {
  id: string;
  name: string;       // full Hebrew name
  short: string;      // short label for cards
  lms: string;        // e.g. "OPAL · Moodle"
  portal: string;     // domain for credential prompts
  icon: string;       // single char mark
}

interface Account {
  universityId: string;
  username: string;
  connected: boolean;
  lastSync: string;   // ISO
}
```

---

## Pages overview

| Route            | Purpose                                | Reference                   |
| ---------------- | -------------------------------------- | --------------------------- |
| `/`              | Classes grid + 4 glance stats          | `ClassesScreen`             |
| `/c/[id]`        | Class detail w/ lecture timeline/table | `ClassDetailScreen`         |
| `/c/[id]/l/[id]` | Lecture summary + Q&A                  | `LectureScreen`             |
| `/stats`         | Deep statistics — new page             | `StatsScreen`               |
| `/settings`      | Account card + 5 setting groups        | `SettingsScreen`            |
| `/setup`         | 3-step onboarding (university → creds → confirm) | `SetupScreen`     |

The home page intentionally shows only 4 high-signal stats (summarized count,
pending count, hours saved, things needing attention). All deeper metrics live
on the new Stats page.

---

## What was changed vs the current app

If you're migrating from the current indigo/purple design at
`open-uni-recorder-web/`:

- **Visual:** the purple gradient header is gone; replaced with a quiet
  topbar + breadcrumbs. The vibe shifted from "SaaS dashboard" to "reading
  app."
- **Lecture detail:** new "split" layout option puts metadata + version history
  in a sidebar. Q&A chat is now inline below the summary.
- **Sidebar:** vertical, right-aligned, lists classes inline.
- **New: Stats page** — moved all the dashboard-y numbers out of the home page
  and gave them their own page. Home stays calm.
- **New: Setup page** — currently a stub. Replace mock with real auth flow.
- **New: Account card** at top of Settings showing connected university.
- **Removed: "+ הרצאה" button** on class detail (lectures are auto-detected from
  the portal, not added manually).
- **Added: course-creation modal** with URL field on the home page.
- **Status colors** standardized via `--st-*` tokens.

---

## For Claude Code

A good prompt template for integration:

> I have a design handoff at `handoff/`. Please port the existing pages in
> `open-uni-recorder-web/app/` to use this new design system. Start with
> `app/globals.css` — replace it with `handoff/design-system.css`, then add
> the Google Fonts links to `app/layout.tsx`. Then port the home page
> (`app/classes/page.tsx`) — read `handoff/reference/screens.jsx > ClassesScreen`
> and `handoff/CLASSES.md` for the markup pattern, but keep all the existing
> data fetching, types, and routing logic. After each page is done, run
> `next build` to catch type issues.

Tell it to do one page at a time and surface a diff for review.
