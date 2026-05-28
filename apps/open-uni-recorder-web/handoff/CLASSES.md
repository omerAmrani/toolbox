# CSS Classes Cheat Sheet

Every utility class in `design-system.css`, what it does, and minimal HTML.

> All examples assume `dir="rtl"`. The CSS uses logical properties
> (`padding-inline-start`, etc) so it also works in LTR but isn't tested there.

---

## Layout shell

| Class       | Purpose                                                  |
| ----------- | -------------------------------------------------------- |
| `.app`      | Grid container: `[sidebar 240px] [main 1fr]`             |
| `.sb`       | Sidebar (the right-side nav in RTL)                      |
| `.main`     | Main content column                                      |
| `.topbar`   | Sticky breadcrumb + search bar at top of main            |
| `.page`     | Page wrapper inside `.main` (padding, max-width)         |
| `.lec-page` | Wider variant for lecture pages (1320px max)             |

```html
<div class="app">
  <aside class="sb">…sidebar…</aside>
  <main class="main">
    <header class="topbar">…</header>
    <div class="page">…content…</div>
  </main>
</div>
```

---

## Sidebar

| Class             | Purpose                                              |
| ----------------- | ---------------------------------------------------- |
| `.sb__brand`      | Logo + product name block                            |
| `.sb__mark`       | 32px square logo mark (ink bg, displays one char)    |
| `.sb__name`       | Product name text                                    |
| `.sb__sub`        | Small secondary text under brand                     |
| `.sb__section`    | A group of nav items                                 |
| `.sb__label`      | Uppercase section heading                            |
| `.sb__item`       | A nav item (button or link)                          |
| `.sb__item.is-active` | Highlighted state (ink bg, bg fg)                |
| `.sb__icon`       | The 22px mark to the left of the label               |
| `.sb__count`      | Right-aligned count badge                            |
| `.sb__divider`    | 1px line between sections                            |
| `.sb__me`         | User card at the bottom (avatar + name)              |
| `.sb__avatar`     | 30px round avatar                                    |

---

## Display heading (large titles)

```html
<div class="display-h">
  <div class="display-h__eye">eyebrow uppercase tag</div>
  <h1 class="display-h__title">Big Display Title.</h1>
  <p class="display-h__sub">Subtitle lead paragraph.</p>
</div>
```

The eyebrow gets a fading horizontal line `::after`. Title uses Frank Ruhl
Libre at clamp(2.4rem, 4.6vw, 4rem).

---

## Buttons & chips

| Class               | Purpose                                  |
| ------------------- | ---------------------------------------- |
| `.btn`              | Primary button (ink bg, bg fg)           |
| `.btn--ghost`       | Outlined button                          |
| `.btn--accent`      | Accent-color button                      |
| `.btn--danger`      | Danger button                            |
| `.btn--sm`          | Smaller version (paired with above)      |
| `.btn--icon`        | Square icon-only variant                 |
| `.chip`             | Pill tag                                 |
| `.chip--accent`     | Accent-colored chip                      |
| `.chip__dot`        | Leading dot inside a chip                |

---

## Status pill (`<Status>` component)

```html
<span class="status" data-s="summarized">
  <span class="status__dot"></span>
  מסוכם
</span>
```

`data-s` values: `pending | transcribing | transcribed | summarizing |
summarized | error`. Color comes from `--st-*` tokens. Pulsing animation on
`summarizing` and `transcribing`.

---

## Cards

| Class           | Purpose                                          |
| --------------- | ------------------------------------------------ |
| `.card`         | Generic card (surface bg, line border, padding) |
| `.card--soft`   | No border, surface-2 bg                          |
| `.card--ghost`  | Transparent bg with border                       |

---

## Home page

| Class                | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `.semester-strip`    | Tab strip (All / Spring 26 / Archive)            |
| `.semester-strip button.is-active` | Active tab                          |
| `.glance`            | 4-cell stats row (grid, dividers between cells)  |
| `.glance__cell`      | Individual stat                                  |
| `.glance__n`         | Big number (with optional `<small>` suffix)      |
| `.glance__l`         | Small label below                                |
| `.class-grid`        | Auto-fill grid of class cards (min 320px)        |
| `.class-card`        | A course card                                    |
| `.class-card__bar`   | Top color stripe (color via `[data-color]`)      |
| `.class-card__icon`  | 40px square icon                                 |
| `.class-card__code`  | Course code (mono, faint)                        |
| `.class-card__title` | Class name                                       |
| `.class-card__meta`  | Semester + year                                  |
| `.class-card__stats` | Bottom row with two stats                        |
| `.spark`             | 14px tall sparkline of lecture statuses          |
| `.spark__bar`        | One bar; modifiers: `--done`, `--active`, `--err`|
| `.class-new`         | Dashed-border "+ new course" tile                |
| `.class-new__plus`   | Round + button inside                            |

`.class-card[data-color="sage|amber|plum|ink"]` sets the bar color.

---

## Class detail

| Class                | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `.detail-h`          | Big header with mark + title + meta + actions    |
| `.detail-h__mark`    | 72px square color mark on the left               |
| `.detail-h__body`    | Center column with code/title/meta               |
| `.detail-h__code`    | Course code (mono, muted)                        |
| `.detail-h__title`   | Class name (Frank Ruhl Libre 2.6rem)             |
| `.detail-h__meta`    | Inline list of stats                             |
| `.detail-h__actions` | Right-aligned actions (layout toggle + edit)     |
| `.layout-toggle`     | Cards/Table segment control                      |
| `.layout-toggle button.is-active` | Active button                       |

### Timeline view

| Class                | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `.timeline`          | Vertical timeline container                      |
| `.timeline::before`  | 1px vertical line (automatic)                    |
| `.tl-item`           | One timeline node                                |
| `.tl-item__dot`      | 11px dot on the line (colored by `[data-status]`)|
| `.tl-item[data-current]` | Gets a soft glow ring                       |
| `.lec-card`          | The lecture card next to a timeline dot          |
| `.lec-card[data-current]` | Highlighted (accent border + soft gradient) |
| `.lec-card__num`     | Big 2-digit lecture number                       |
| `.lec-card__title`   | Lecture name                                     |
| `.lec-card__meta`    | Date · duration · status row                     |
| `.lec-card__actions` | Right-aligned action buttons                     |
| `.lec-card__progress`| 3px in-progress bar (spans full width)           |

### Table view

| Class                | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `.lec-table`         | Lecture table                                    |
| `.lec-table__num`    | Lecture # column                                 |
| `.lec-table__name`   | Name column                                      |
| `.lec-table__date`   | Date / duration columns (mono)                   |
| `.lec-table tr[data-current]` | Highlighted row                         |

---

## Lecture page

| Class                | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `.lec-h`             | Lecture header (title + meta + actions)          |
| `.lec-h__eye`        | Eyebrow with class name link                     |
| `.lec-h__title`      | Lecture title (Frank Ruhl Libre 2.8rem)          |
| `.lec-h__meta`       | Date · duration · read time · status             |
| `.lec-h__meta .dot`  | 3px round separator dot                          |
| `.lec-h__actions`    | Right-aligned action buttons                     |
| `.lec-grid`          | Single-column content grid                       |
| `.lec-grid--split`   | Two-column: content + sidebar (380px)            |
| `.lec-progress`      | Fixed 2px reading progress bar at top of viewport|
| `.lec-progress span` | The filled portion                               |
| `.lec-aside`         | Sticky sidebar (in split mode)                   |
| `.lec-aside__meta`   | A grouped metadata block in the sidebar          |
| `.lec-aside__title`  | Eyebrow heading in the sidebar                   |
| `.lec-aside__row`    | A `<dt>/<dd>` row, dashed bottom border          |

### Summary typography (Markdown wrapper)

```html
<div class="summary">
  <h1>…</h1>
  <h2>…</h2>  <!-- gets a § marker in the margin -->
  <p>…</p>
  <blockquote>…</blockquote>
  <pre><code>…</code></pre>
  <div class="math">∫ x dx = …</div>  <!-- styled math block -->
</div>
```

The `.summary` font scale, line height, and serif family are all tuned for
long-form reading.

### Q&A

| Class             | Purpose                                          |
| ----------------- | ------------------------------------------------ |
| `.qa`             | Outer Q&A section                                |
| `.qa--inline`     | Inline variant (no top border, less margin)     |
| `.qa__h`          | Section header (title + subtitle)                |
| `.qa__title`      | "Ask the lecture"                                |
| `.qa__sub`        | Helper text                                      |
| `.qa__msg`        | One Q+A message                                  |
| `.qa__q`          | Question bubble (surface-2 bg, rounded)         |
| `.qa__a`          | Answer paragraph                                 |
| `.qa__avatar`     | 28px round avatar                                |
| `.qa__avatar--me` | User avatar variant                              |
| `.qa__compose`    | Input + send button row                          |
| `.suggested`      | Row of dashed-border suggestion chips            |

### Streaming box (when AI is generating)

```html
<div class="streaming">
  <div class="streaming__h">
    <span class="streaming__pulse"></span>
    מסכם...
  </div>
  <div class="streaming__txt">Text streaming here...</div>
</div>
```

Has a built-in shimmer animation.

---

## Stats page

| Class                | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `.stats-grid`        | 4-col grid of stat tiles                         |
| `.stat-tile`         | Single tile (card-like)                          |
| `.stat-tile--accent` | Filled with accent-soft bg                       |
| `.stat-tile--warn`   | Warning-tinted variant                           |
| `.stat-tile__eye`    | Uppercase eyebrow                                |
| `.stat-tile__n`      | Big number                                       |
| `.stat-tile__sub`    | Footer with secondary info                       |
| `.dist`              | Status distribution card                         |
| `.dist__bar`         | 14px horizontal ribbon                           |
| `.dist__seg`         | One color segment (flex-grow by count)           |
| `.dist__legend`      | Legend row below                                 |
| `.dist__l`           | One legend item                                  |
| `.dist__l-dot`       | Color dot                                        |
| `.dist__l-lbl`       | Label                                            |
| `.dist__l-n`         | Mono numeric count                               |
| `.weekly__card`      | Weekly activity bar chart card                   |
| `.weekly__bars`      | Flex row of bars                                 |
| `.weekly__bar`       | One bar container                                |
| `.weekly__bar-fill`  | The filled bar itself                            |
| `.weekly__bar-n`     | Count label above the bar                        |
| `.weekly__bar-l`     | Date label below the bar                         |
| `.bycls`             | Per-class breakdown card                         |
| `.bycls__row`        | One row                                          |
| `.bycls__icon`       | Course icon                                      |
| `.bycls__title`      | Course name                                      |
| `.bycls__bar`        | 6px stacked progress bar                         |
| `.bycls__stat`       | Right-aligned mono stat                          |
| `.section-h`         | Section heading with subtitle                    |
| `.section-h__t`      | Section title                                    |
| `.section-h__s`      | Section subtitle (muted)                         |

---

## Settings

| Class                | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `.settings-grid`     | 2-col grid of setting cards                      |
| `.set-card`          | A setting card                                   |
| `.set-card--wide`    | Spans both columns                               |
| `.set-card__h`       | Card header (title + subtitle + actions row)     |
| `.set-card__title`   | Card title                                       |
| `.set-card__sub`     | Card subtitle                                    |
| `.model`             | AI model status row                              |
| `.model--ok` `--warn` `--err` | Tinted variants                         |
| `.model__avatar`     | Square model badge                               |
| `.model__name`       | Model name                                       |
| `.model__sub`        | Provider · version (mono)                        |
| `.model__stat`       | Right-aligned metric                             |
| `.queue-row`         | Processing queue row                             |
| `.queue-row__class`  | Class name (bold)                                |
| `.queue-row__name`   | Lecture name                                     |
| `.queue-row__t`      | Timestamp (mono)                                 |
| `.account`           | Dark Account card (top of settings)              |
| `.account__avatar`   | University mark                                  |
| `.account__uni`      | University name                                  |
| `.account__user`     | Username (mono)                                  |
| `.account__pill`     | Connection status pill                           |

---

## Setup (onboarding)

| Class                | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `.setup`             | Full-screen 2-col layout                         |
| `.setup__hero`       | Dark left pane with pitch                        |
| `.setup__brand`      | Logo at top                                      |
| `.setup__brand-mark` | Small logo square                                |
| `.setup__pitch`      | Hero title + paragraph + list                    |
| `.setup__pitch-deco` | Decorative radial gradient (positioned)          |
| `.setup__footer`     | Privacy footer in hero                           |
| `.setup__form`       | Right pane with form                             |
| `.setup__step`       | "Step X of N" eyebrow                            |
| `.setup__h`          | Step heading                                     |
| `.setup__sub`        | Step subtitle                                    |
| `.uni-grid`          | Grid of university cards                         |
| `.uni-card`          | One university option                            |
| `.uni-card.is-selected` | Selected state                                |
| `.uni-card__icon`    | University mark                                  |
| `.uni-card__name`    | Short name                                       |
| `.uni-card__sub`     | LMS type                                         |
| `.step-dots`         | Progress dots row                                |
| `.step-dots span.is-active`, `.is-done` | States                        |
| `.connect-status`    | Success banner ("Connected!")                    |
| `.connect-status__icon` | Round green ✓ icon                            |

---

## Modal

| Class             | Purpose                                          |
| ----------------- | ------------------------------------------------ |
| `.modal-bg`       | Backdrop overlay (click outside to dismiss)      |
| `.modal`          | Centered card                                    |
| `.modal__eye`     | Uppercase eyebrow tag                            |
| `.modal__title`   | Big title                                        |
| `.modal__field`   | Label + input pair                               |
| `.modal__hint`    | Small help text under input                      |
| `.modal__row`     | Horizontal row of fields (flex equal)            |
| `.modal__actions` | Right-aligned button row at the bottom           |

For form inputs, just style with `.modal__field input` — direction-aware. Add
`dir="ltr"` and they'll render in mono (designed for URLs, codes).

---

## Search & breadcrumbs (Topbar)

| Class                | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `.crumbs`            | Breadcrumb container                             |
| `.crumbs a`          | Link crumb                                       |
| `.crumbs__sep`       | The "/" separator                                |
| `.crumbs__current`   | Current page (last crumb, no link)               |
| `.search`            | Search wrapper                                   |
| `.search input`      | The text input                                   |
| `.search__icon`      | Magnifying glass on the leading side             |
| `.search__kbd`       | ⌘K hint on the trailing side (hidden on mobile)  |

---

## Animation utilities

| Class      | Effect                                                |
| ---------- | ----------------------------------------------------- |
| `.fade-in` | 0.35s fade-up on mount (apply to page root)           |
| `.spin`    | 14px spinning circle (use for inline loading)         |

Built-in animations (no class needed):

- `.streaming` — shimmer sweep
- `.streaming__pulse` — pulsing dot
- `.tl-item[data-status="summarizing"] .tl-item__dot` — pulsing color ring
- `.status[data-s="summarizing"] .status__dot` — pulsing
- `.spark__bar--active` — opacity pulse

---

## Tokens reference

CSS variables you can use anywhere:

### Colors
```
--bg, --surface, --surface-2          backgrounds
--line, --line-2                      borders
--ink, --ink-2                        text
--muted, --faint                      muted text
--accent, --accent-2, --accent-on     brand color
--accent-soft                         soft accent bg
--warn, --danger, --good              feedback colors
--st-summarized, --st-summarizing,
--st-transcribed, --st-transcribing,
--st-pending, --st-error              status colors
```

### Spacing
```
--gap, --gap-sm, --gap-lg             vertical rhythm
--pad-card                            card inner padding
--row-pad                             row inner padding
--radius, --radius-sm, --radius-lg    border radii
```

### Type
```
--font-ui          Heebo (UI text)
--font-read       Frank Ruhl Libre (display, summary)
--font-mono       JetBrains Mono (codes, numbers)

--type-display    Display headlines
--type-h1         Page titles
--type-h2         Section titles
--type-lede       Lead paragraphs
--type-body       Body text (default)
--type-small      Small text
--type-eyebrow    Uppercase eyebrows
```
