# Auth

Google OAuth login. Issues a JWT session cookie that every other controller
relies on (via `JwtAuthGuard` + `CurrentUser`) to scope data per user.

**Local mode** (`GOOGLE_CLIENT_ID` unset — the default for a fresh clone, see
docs/adr/0002): no login at all. `JwtAuthGuard` treats every request as the
fixed user `{ sub: 'local', email: 'local' }`, and `main.ts` binds the API to
`127.0.0.1` only so the login-free API isn't reachable from the network.

## API

- Module: `AuthModule`
- Controller: `AuthController` (`api/auth`)
- Service: `AuthService`

Routes:
- `GET /api/auth/google` — redirects to Google's OAuth consent screen.
- `GET /api/auth/google/callback?code=...` — exchanges the code for tokens, verifies the id_token's email, creates the user on first login, sets the session cookie, redirects to `WEB_ORIGIN`. Any failure (bad code, unverified email, Google API error) redirects to `WEB_ORIGIN/login?error=oauth_failed` instead of erroring.
- `POST /api/auth/logout` — clears the session cookie, returns `{ ok: true }`.
- `GET /api/auth/me` — guarded by `JwtAuthGuard`; returns `{ id, email, local }` for the current session, `401` if not logged in (never in local mode, where it returns `{ id: 'local', email: 'local', local: true }`).

**Flow:**
1. `getGoogleAuthUrl()` builds the Google consent redirect URL (`openid email` scope) via a lazily-created `OAuth2Client` (`google-auth-library`).
2. `handleGoogleCallback(code)` exchanges the code for tokens, verifies the returned `id_token`, and requires `email_verified: true` — an unverified email is rejected.
3. `loginWithGoogle(code)` calls `handleGoogleCallback`, then `getOrCreateUser(email)` (creates the user row on first login), signs a JWT (`{ sub: userId, email }`, 30-day expiry), and returns it for the controller to set as an `httpOnly` cookie (`auth_token`).
4. `JwtAuthGuard` reads that cookie on every guarded route and verifies it; `CurrentUser` pulls `sub` off the verified payload as the request's `userId`.

**Config:** `JWT_SECRET` (required only when Google login is on — generate with `openssl rand -hex 32`), `WEB_ORIGIN`, `API_ORIGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. `GOOGLE_REDIRECT_URI` is derived from `API_ORIGIN` (`${API_ORIGIN}/api/auth/google/callback`) and must be registered as an authorized redirect URI on the Google OAuth client. If `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are unset, `getGoogleAuthUrl`/`handleGoogleCallback` throw.

## Tests

`test/auth.spec.ts` mocks `google-auth-library`'s `OAuth2Client` (never hits Google):
- `GET /api/auth/google` — redirects to the generated consent URL.
- `GET /api/auth/google/callback` — failed exchange or unverified email redirects to the login error page with no cookie set; a successful callback creates/reuses the user, sets the cookie, and redirects home.
- `me` — 401 without a session cookie, returns the correct user with one; in local mode returns the fixed local user without a cookie.
- `logout` — clears the cookie.

## Web

- Login page (`/login`) — Google sign-in button (`react-google-button`), links to `GET /api/auth/google`; in local mode redirects straight to `/`
- `Sidebar` component — calls `/api/auth/me` on load to show the logged-in user, `/api/auth/logout` on sign-out; the user/logout block is hidden in local mode
