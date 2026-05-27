# Toolbox

Personal monorepo for my tools.
## Apps

### open-uni-recorder

Automatically detects new lectures from the OPAL platform, downloads and transcribes them, generates summaries, and optionally emails you the result.

**Features**
- Detects new lectures from OPAL (Playwright, headless)
- Downloads lecture video and transcribes via Groq Whisper or local whisper.cpp
- Summarizes transcripts via Gemini, Groq, Claude, or Ollama
- Q&A generation from summaries (Claude)
- Email notifications on detection and completion
- Cron: runs automatically every Thursday + Friday at 10:00 AM

**Stack:** NestJS API (port 3001) + Next.js 15 web UI (port 3002), SQLite, no ORM

## Prerequisites

- Node.js 20+
- pnpm (`npm i -g pnpm`)
- ffmpeg (required for audio extraction: `brew install ffmpeg`)
- A [Groq](https://console.groq.com) API key (required — used for transcription and summarization)
- Gemini, Anthropic, or Ollama API key (optional — alternative summarization backends)

## Setup

```bash
# Install dependencies
pnpm install

# Install Playwright (for lecture detection)
pnpm --filter @toolbox/open-uni-recorder-api exec playwright install chromium

# Configure environment
cp apps/open-uni-recorder-api/.env.example apps/open-uni-recorder-api/.env
cp apps/open-uni-recorder-web/.env.example apps/open-uni-recorder-web/.env
# Fill in your credentials and API keys in both .env files

# Start both apps
turbo dev
```

Web UI: http://localhost:3002  
API: http://localhost:3001

## Structure

```
apps/
  open-uni-recorder-api/   NestJS API
  open-uni-recorder-web/   Next.js web UI
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
