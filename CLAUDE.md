# Toolbox Monorepo

Personal platform containing productivity and utility apps.

## Structure

- apps/open-uni-recorder-api — NestJS API, lecture processor (Groq/Gemini/Claude/Ollama), SQLite
- apps/open-uni-recorder-web — Next.js 15 web UI for the above
- packages/ui — shared React components (stub, promote when a second app exists)
- packages/config — shared ESLint configs (`eslint/base|next|react-internal`) and tsconfig presets (`tsconfig/base|nextjs|react-library`)

## Package Manager

pnpm with workspaces. Always run installs from root.

## Commands

Run a specific app:
turbo run dev --filter=@toolbox/<app-name>
turbo run build --filter=@toolbox/<app-name>

Add a dep to a specific app:
pnpm add <package> --filter=@toolbox/<app-name>

Add a dep to root (dev tooling only):
pnpm add -D <package> -w

## Shared Packages

All packages and apps are namespaced under @toolbox/
Import as: import { ... } from "@toolbox/ai"

## Before Implementing UI or Backend Changes

- Always check `packages/` for relevant existing code before implementing any UI or backend change/feature
- For UI changes: prefer components from `packages/ui` over writing new ones
- For Next.js apps: prefer modules from `node_modules` lib utilities and Next.js built-ins before adding custom implementations

## Conventions

- Each app has its own .env.local, never commit secrets
- Shared logic goes into /packages only when used by 2+ apps
- Do not create a package preemptively
- When you notice code that could be generic/reusable, flag it and ask the user if it should be moved to `packages/`

## Docs

- `docs/` inside each app is the source for feature-specific documentation
- When adding or changing a feature, update or create the relevant doc in `docs/`
- Docs are written in English, markdown format

## Before Writing Any Code

**Map the blast radius.** What modules, services, or contracts does this change touch? What currently depends on what's being changed? Write this out before touching code — not after.

**Think unhappy paths first.** Before implementing: what is the state of the system if this fails halfway? Is data left in a consistent state? Is the failure recoverable without manual intervention? Answer these before writing the happy path.

**Uphold data integrity contracts.** Each app has its own write contract (e.g. DB + filesystem mirror in the API). Any feature that writes data must uphold all sides of that contract — never write to one without the other.

**When to stop and ask.** If a feature touches more than 3 modules, requires a design decision with real trade-offs, or the requirements feel ambiguous — stop and ask before writing code. Rework costs more than a 2-minute clarification.