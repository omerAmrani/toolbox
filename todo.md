## todos

Tracking here for now (personal project — GitHub Issues is overkill until there are collaborators).

---

### High priority / quick wins

- [ ] **Improve Claude context across both apps** — Update `CLAUDE.md` files in `open-uni-recorder-api` and `open-uni-recorder-web` to describe each app's module structure, key flows (pipeline, transcription, summarization), and how the two services communicate (base URLs, API contracts). Goal: Claude shouldn't need to re-explore the codebase each session.

- [ ] **Document features per app** — Add a `docs/features.md` in each app listing the main features, their status (working / in progress / planned), and the relevant modules. Keep it short — bullet list is fine.

### Medium priority

- [ ] **Playwright e2e tests** — Headless tests covering the main user flows: upload a lecture, view transcript + summary, browse classes. Set up in `apps/open-uni-recorder-web`. Needs the API running locally as well, so document the setup in a `docs/testing.md`.

- [ ] **New web design + theme switching** — Redesign the web UI. Add a theme switcher (at minimum: light / dark). Check `packages/ui` first before writing new components. Define the theme tokens in the shared UI package so both apps can use them if needed.

### Lower priority / needs more planning

- [ ] **Deploy to server** — Before starting, answer these questions:
  - Hosting platform (VPS, Railway, Fly.io, self-hosted)?
  - Auth — does the app need user accounts, or is it single-user/self-hosted?
  - Whisper — run `whisper.cpp` on the server or use the Groq/OpenAI API only?
  - Env vars — list all required keys (Groq, Gemini, Claude, OpenAI, email) and decide where they live (`.env` on server vs secrets manager)
  - Once answers are clear, break this into sub-tasks per service (API, web, whisper worker)
