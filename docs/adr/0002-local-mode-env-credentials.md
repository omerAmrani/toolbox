# Local mode: no login, credentials from .env

Remote hosting is paused and open-uni is handed to users to clone and run on their own machine, so it must work with no third-party setup beyond API keys. When `GOOGLE_CLIENT_ID` is unset the app runs in **local mode**: every request is treated as one fixed local user (no login page), the API binds to `127.0.0.1` only, and OPAL + AI credentials are read from `apps/open-uni/api/.env` instead of being sent per-request from the browser. The browser-side encrypted credential store was deleted rather than kept dormant.

## Consequences

- This reverses the earlier "per-user, client-side encrypted credentials, never server-side" rule. That rule protected users on a shared server; in local mode the server is the user's own laptop.
- Google OAuth code stays and activates only when `GOOGLE_CLIENT_ID` is set, but remote mode is not usable as-is: one `.env` holds one user's credentials. Returning to remote mode means restoring per-user credentials (revert the commit that removed `web/lib/credentials.ts`) and a job queue (see ADR 0001).
- Each feature checks only the keys it needs: OPAL for detect/sync, OPAL + `GROQ_API_KEY` for transcribe, `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` for summarize. The app boots with none set.
- Local mode binds to `127.0.0.1`, so it is unreachable through Docker's port mapping: the Docker image (and any remote deploy) must run in Google mode. `JWT_SECRET` is required only in Google mode rather than auto-generated — local mode never signs a JWT, so a fresh clone needs no secret.
