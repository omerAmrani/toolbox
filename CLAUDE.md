# Toolbox Monorepo

Personal platform containing productivity and utility apps.

## Structure

- apps/open-uni-recorder — lecture summarizer, Express/Node.js ESM, AI pipeline (Groq/Gemini/Claude/Ollama), SQLite, no build step
- apps/macro-chat — macro nutrition tracker, Next.js + lightweight backend (planned)
- packages/ui — shared React components, each app has its own theme (stub)
- packages/ai — AI client wrappers, prompt templates, retry logic (planned)
- packages/email — Gmail API, email utils (planned)
- packages/github — GitHub API client (planned)
- packages/config — shared ESLint configs (`eslint/base|next|react-internal`) and tsconfig presets (`tsconfig/base|nextjs|react-library`)

## Package Manager

pnpm with workspaces. Always run installs from root.

## Commands

Run a specific app:
turbo run dev --filter=@toolbox/open-uni-recorder
turbo run build --filter=@toolbox/open-uni-recorder

Add a dep to a specific app:
pnpm add <package> --filter=@toolbox/open-uni-recorder

Add a dep to root (dev tooling only):
pnpm add -D <package> -w

## Shared Packages

All packages and apps are namespaced under @toolbox/
Import as: import { ... } from "@toolbox/ai"

## Conventions

- Each app has its own .env.local, never commit secrets
- Shared logic goes into /packages only when used by 2+ apps
- Do not create a package preemptively