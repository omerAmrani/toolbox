# Auto-Pipeline: Cron + Email Summary + Q&A Loop

---

## ✅ Stage 1 — Lecture Detection & Sync (done)

- `lib/detect.js` — logs into OPAL, scrapes `div.ovc_playlist[id^="playlist"]` on the recordings page, deduplicates by `v=` param against existing lectures
- `PATCH /api/classes/:classId` — saves `opalCourseUrl` to class meta
- `POST /api/classes/sync` — SSE, runs detection for all classes with `opalCourseUrl`
- Settings page: loads existing lectures on open (with date + status), sync appends new ones with Queue/Skip
- Class-detail page: editable OPAL URL field
- Both classes have `opalCourseUrl` set in `meta.json`

---

## ✅ Stage 2 — Download Queue & Duplicate Prevention (done)

- `lib/pipeline.js` — `runQueue()` processes all `pending` lectures serially; sets `processing` before starting, `done` on success, `failed` + `lastError`/`lastErrorAt` on error; `isQueueRunning()` prevents concurrent runs
- `resetStuckProcessing()` called on server startup — resets any `processing` → `failed` (kill-server recovery)
- `GET /api/classes/queue` — all lectures across all classes with status/timestamps
- `POST /api/classes/run-queue` — fire-and-forget queue trigger
- `POST /api/classes/:classId/lectures/:lectureId/retry` — resets `failed` → `pending`
- Settings page: queue panel shows only `pending` lectures (what will run next); auto-refresh every 3s while any lecture is `processing`; clears to "התור ריק" once all are processed

---

## ✅ Stage 3 — Cron Job (done)

- `lib/pipeline.js` — `runFullPipeline()` shared by cron and manual trigger: detects new lectures and auto-creates them as `pending` — does NOT run the queue automatically
- `lib/pipeline.js` — `logCronRun()` / `getLastCronLog()` write to `data/cron-log.json` (last 50 entries)
- `server.js` — `node-cron` fires Thursday + Friday at 10:00 AM Israel time (`'0 10 * * 4,5'`); if `found === 0`, retries every 30 min until 18:00
- `POST /api/classes/run-pipeline` — detect-only trigger; creates pending lectures but does not process them
- `POST /api/classes/run-queue` — processes already-approved pending lectures; triggered by "הפעל תור" button
- `GET /api/classes/cron-log` — returns last log entry for the settings page
- Settings page: "הפעל תור" button runs the queue (not the full pipeline); last cron run info shown below the button
- Settings page: "בדיקת קרון" card — manually fires `run-pipeline` (detect + create pending), refreshes queue panel on completion
- **Approval flow:** cron detects → lectures sit as `pending` → user reviews in sync panel (Queue/Skip) → "הפעל תור" processes approved ones

---

## ✅ Stage 3.5 — Skipped / Archive Status (done)

- `skipped` is a persistent lecture status: lecture is saved in the DB so it won't be re-detected as new on future scans
- Triggered manually — either by clicking "דלג" on a new lecture in the sync panel, or `POST /api/classes/:classId/lectures/:lectureId/skip` on an existing `pending` lecture
- `POST /api/classes/:classId/lectures/:lectureId/unskip` → moves `skipped` → `pending` (queued for processing)
- `POST /api/classes/:classId/lectures` accepts `status: 'skipped'` to create directly as skipped
- Settings page: queue panel — each pending lecture has a "דלג" button; clicking it skips the lecture and refreshes the archive
- Settings page: "ארכיון" card lists all skipped lectures across classes with "הוצא מארכיון" button
- Queue panel and `runQueue()` ignore `skipped` lectures — only `pending` is processed

**Status lifecycle:**
```
pending → processing → done
                     → failed (retryable via /retry)
pending → skipped    (manual, hidden from queue, persisted so not re-detected)
skipped → pending    (unskip via UI or /unskip route)
```

---

## ✅ Stage 4 — Email Summary Delivery (done)

- `lib/email.js` — nodemailer + Gmail SMTP; `sendLectureSummary()` attaches `summary.md` and sends a one-liner Hebrew body
- `lib/pipeline.js` — fire-and-forget call after `status → done`; email failure logs a warning, lecture stays `done`
- `lib/config.js` — exports `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `NOTIFY_EMAIL`
- Subject: `[Class Name] — Lecture Name, DD/MM/YYYY`
- Body: `הסיכום של "..." מתאריך ... בקורס "..." מצורף.`
- Attachment: `summary.md` (full summary content)
- Email body is HTML (markdown rendered via `marked`), with a plain-text fallback; no attachment
- If any of the three email env vars are missing, email is skipped silently with a log line
- `POST /api/classes/test-email` — sends a test email for any existing lecture with a summary; used by the settings page test UI
- Settings page: "בדיקת שליחת מייל" card — dropdown of lectures with summaries, send button, success/error feedback

---

## Stage 5 — Detection Notification + In-App Q&A

### ✅ 5a — Detection Notification Email (done)

- `lib/email.js` — `sendDetectionNotification(found[])` sends an HTML table of new lectures (class, name, date)
- `lib/pipeline.js` — fire-and-forget call at end of `runFullPipeline()` when `found > 0`; skips silently when `found === 0`
- Subject: `[פייפליין] נמצאו X הרצאות חדשות`
- Body: HTML table + plain-text fallback; footer: "פתח את ההגדרות כדי לאשר או לדלג"

---

### ✅ 5b — In-App Q&A (done)

- `lib/qa.js` — `generateQuestions(summary)` and `evaluateAnswers(questions, answers)` via Claude Haiku; both return parsed JSON
- `GET /api/classes/:classId/lectures/:lectureId/qa` — returns `{ rounds: [] }` or existing session
- `POST .../qa/generate` — generates 4-5 questions from current summary, appends new round to `qa.json`
- `POST .../qa/answer` — evaluates answers, stores per-answer `{ correct, explanation }` feedback in round
- Session persisted in `lectures/<lectureId>/qa.json`: `{ rounds: [{ questions, answers, feedback, timestamp }] }`
- Lecture page: "🧠 שאלות ותשובות" collapsible (shown only when summary exists); "צור שאלות" → answer textareas → per-answer feedback with color coding → "סיבוב נוסף"

---

## Stage 6 — Hosting (Railway)

**Goal:** Deploy to Railway so the app is always on and reachable from anywhere.

- Push repo to Railway → get a public URL
- ffmpeg + Playwright available via Nixpacks or Dockerfile
- Cron fires reliably even when Mac is off
- Unlocks: clickable Approve/Skip links in detection notification email (replace settings-page flow)
- `APP_BASE_URL` env var for generating correct links in emails

### Success Criteria
- [ ] App runs on Railway, accessible via public URL
- [ ] Cron fires on schedule without Mac being on
- [ ] Detection email contains working Approve/Skip links

---

## Implementation Order

| Stage | Status | Effort |
|---|---|---|
| 1 — Detection + UI | ✅ Done | — |
| 2 — Queue/Status + UI | ✅ Done | — |
| 3 — Cron | ✅ Done | — |
| 4 — Email Summary | ✅ Done | — |
| 5a — Detection Notification Email | ✅ Done | — |
| 5b — In-App Q&A | ✅ Done | — |
| 6 — Hosting (Railway) | — | Medium |

---

## Env Vars

```
GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
NOTIFY_EMAIL=you@gmail.com
APP_BASE_URL=http://localhost:3000   # set to Railway URL in production (Stage 6)
```
