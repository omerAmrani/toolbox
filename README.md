# Toolbox

Personal monorepo for my tools.
## Apps

### open-uni-recorder

Detects new lectures on the Open University's OPAL platform, downloads and transcribes them, and generates summaries. Runs locally on your machine — no account, no login.

**Features**
- Detects new lectures from OPAL (Playwright, headless) — manual "check now" per class or for all classes
- Downloads lecture video and transcribes via Groq Whisper
- Summarizes transcripts via Gemini or Claude
- Versioned summaries per lecture

**Stack:** NestJS API (port 3001) + Next.js 15 web UI (port 3002), SQLite, no ORM

## Prerequisites

- Node.js 20+
- pnpm (`npm i -g pnpm`)
- ffmpeg (`brew install ffmpeg`)
- A [Groq](https://console.groq.com) API key (free tier) — for transcription
- A Gemini or Anthropic API key — for summaries (optional if you only want transcripts)

## Setup

```bash
pnpm install                # also installs Playwright's Chromium
cp apps/open-uni/api/.env.example apps/open-uni/api/.env
# fill in OPENU_USERNAME / OPENU_PASSWORD / OPENU_ID, GROQ_API_KEY,
# and GEMINI_API_KEY or ANTHROPIC_API_KEY
pnpm dev:open-uni
```

Open http://127.0.0.1:3002. The settings page shows which keys the app found; transcribe/summarize buttons stay disabled until their keys are set.

## Structure

```
apps/
  open-uni/
    api/                   NestJS API
    web/                   Next.js web UI
    tray/                  macOS tray app (Swift)
packages/
  config/                  Shared ESLint + tsconfig presets
  ui/                      Shared React components (stub)
```

## Commands

```bash
turbo dev                                          # start all apps
turbo run dev --filter=@toolbox/<app-name>         # start one app
turbo run build --filter=@toolbox/<app-name>       # build one app
pnpm add <package> --filter=@toolbox/<app-name>    # add a dep to an app
```
