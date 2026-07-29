# Setup Page (`/setup`)

Onboarding flow for first-time configuration. Rendered standalone — no `AppShell`, no sidebar.

## Route

`/setup`

## Flow

3-step wizard. State is local (`useState`) — no persistence until backend is wired (see todo).

### Step 1 — Select university

Grid of university cards. Currently two entries:

| University | Status |
|---|---|
| האוניברסיטה הפתוחה | active |
| האוניברסיטה העברית | stub (disabled, "בקרוב") |

Stub cards are visually dimmed and non-clickable. Continue button disabled until a selection is made.

### Step 2 — Credentials

Username + password fields. Labels adapt to selected university (e.g. "מספר ת״ז" for OpenU).

"התחבר" button is disabled until both fields are filled. On click: simulates a connection test via `setTimeout(1400ms)` → shows success banner → unlocks Continue.

**Backend-attach todo:** replace `setTimeout` with a real `POST /api/auth/connect` call.

### Step 3 — Done

Confirms the account is linked. CTA navigates to `/classes`.

**Backend-attach todo:** show real detected courses from the API response.

## Static vs. wired

This page is intentionally static (decision 6). No middleware redirect exists — navigating to `/setup` is manual only. Future work: add `middleware.ts` redirect when `account.connected` is falsy.
