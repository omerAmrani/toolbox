# Auth

Passwordless magic-link login. Issues a JWT session cookie that every other
controller relies on (via `JwtAuthGuard` + `CurrentUser`) to scope data per user.

## API

- Module: `AuthModule`
- Controller: `AuthController` (`api/auth`)
- Service: `AuthService`

Routes:
- `POST /api/auth/request-link` — `{ email }` → emails a magic link. Always responds `{ ok: true }`, even for an unknown email (avoids account enumeration). `400` only for a missing/malformed email.
- `GET /api/auth/verify?token=...` — consumes the token, creates the user on first login, sets the session cookie, redirects to `WEB_ORIGIN`. Invalid/expired/reused token → redirects to `WEB_ORIGIN/login?error=invalid_link` instead of erroring.
- `POST /api/auth/logout` — clears the session cookie, returns `{ ok: true }`.
- `GET /api/auth/me` — guarded by `JwtAuthGuard`; returns `{ id, email }` for the current session, `401` if not logged in.

**Flow:**
1. `requestLink(email)` normalizes the email (trim + lowercase), generates a random 32-byte token, stores its SHA-256 hash with a 15-minute expiry (`magic_link_tokens` table), and emails a verify link containing the raw token.
2. Repeated requests for the same normalized email within 60 seconds are silently dropped (in-memory cooldown, no signal returned to the caller either way) — throttles a spammer without confirming whether an email is already rate-limited.
3. `verify(token)` hashes the incoming token, looks up and consumes the matching row (single-use — a second `verify` with the same token fails). `getOrCreateUser(email)` creates the user row on first login. A JWT (`{ sub: userId, email }`, 30-day expiry) is signed and set as an `httpOnly` cookie (`auth_token`).
4. `JwtAuthGuard` reads that cookie on every guarded route and verifies it; `CurrentUser` pulls `sub` off the verified payload as the request's `userId`.

**Config:** `JWT_SECRET` (required outside tests — generate with `openssl rand -hex 32`), `WEB_ORIGIN`, `API_ORIGIN`. Email delivery depends on `EmailModule`'s `GMAIL_*` vars (see [email.md](email.md)) — if unset, `sendMagicLink` throws and `request-link` fails with a 500 rather than silently no-op'ing.

**Gotcha:** the in-memory rate-limit map (`lastRequestAt`) is per-process — fine for the current single-instance deployment, but resets on restart and won't be shared if this ever runs multi-instance.

## Tests

`test/auth.spec.ts` covers all four routes against the real DB (`EmailService` mocked, never hits SMTP):
- `request-link` — 400 on missing/invalid email, normalizes casing before sending, rate-limits a repeat request for the same email.
- `verify` — invalid token redirects to the error page with no cookie set; a valid token sets the cookie and redirects home; a reused token is rejected.
- `me` — 401 without a session cookie, returns the correct user with one.
- `logout` — clears the cookie.

## Web

- Login page (`/login`) — email form, posts to `request-link`, shows a "check your inbox" state
- `Sidebar` component — calls `/api/auth/me` on load to show the logged-in user, `/api/auth/logout` on sign-out
