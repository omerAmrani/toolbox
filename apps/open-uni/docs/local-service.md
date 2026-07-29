# Local service (macOS tray)

A menu bar app that runs `open-uni-recorder-api` and `open-uni-recorder-web` as owned child processes, so both apps can run without a terminal open. This is an alternative to `turbo run dev` for normal (non-development) use — it runs production builds, not dev servers.

**Scope:** macOS only. No OS-level background service (no launchd) — the tray app itself spawns, health-polls, and owns both child processes. When the tray quits, both processes stop; when it launches, both start. `.dmg`/`.exe` installer packaging is a separate, not-yet-built layer (currently `swift build` + manual copy to `~/Applications`).

## Known limitations (accepted, not oversights)

- **Cron only fires while the tray is running.** `jobs.service.ts`'s `CronJob`s need a live process. If a job's scheduled time falls while the tray isn't running (quit, crashed past its retry cap, laptop asleep), it simply doesn't fire that cycle — no catch-up/backfill logic.
- **No dual-run guard.** Running `pnpm dev` while the tray is already running doesn't need a lockfile — root `package.json`'s `predev` script already does `lsof -ti:3001,3002 | xargs kill -9` before dev starts, so the tray's processes get killed first and dev's processes bind the now-free ports. No concurrent-write window on the DB/filesystem mirror.
- **Crash-cap UX is minimal.** No built-in log viewer on the "Crashed" state — open the logs below manually.

## Build & launch

```
pnpm tray:build
open ~/Applications/OpenUniRecorder.app
```

`tray:build` runs `turbo run build` for both apps, then `apps/open-uni/tray/mac/build.sh`, which `swift build -c release`s the tray and copies it to `~/Applications/OpenUniRecorder.app`.

First launch: the build is unsigned, so macOS Gatekeeper blocks a plain double-click. In Finder, right-click `OpenUniRecorder.app` → Open, then confirm once. Subsequent launches work normally.

## What it does

- Spawns the API (`dist/src/main.js`, port 3001) and web (`next start`, port 3002) as direct child processes of the tray.
- Health-polls both every 5s (`GET /health/ping`, `GET /api/health`).
- Respawns a crashed child automatically, up to 3 crashes within 60s — after that it shows a "Crashed" state in the menu and needs a manual **Restart**.
- Registers itself for login auto-start via `SMAppService.mainApp.register()`.
- Menu bar icon reflects status: `◌` starting, `●` running, `◐` one side down, `○` both down / crashed.

## Logs

`~/Library/Logs/OpenUniRecorder/`:
- `api-out.log` / `api-err.log`
- `web-out.log` / `web-err.log`

No built-in log viewer — open these manually if something looks wrong.

## Resetting

- **Quit** from the menu, or kill the tray process (`SIGTERM`/`SIGINT`) — both child processes are stopped cleanly along with it.
- If something's stuck: quit the tray, then `lsof -ti:3001,3002 | xargs kill` to clear any stray processes, then relaunch.
- `kill -9` on the tray can't be caught by any supervisor — an unavoidable ceiling of this design. If you have to force-quit, check `lsof -ti:3001,3002` afterward.

## Not built this pass

- `.dmg`/`.exe` installer packaging — this is a `swift build` + manual copy to `~/Applications`, not a distributable package. When revisited: `.dmg` via `create-dmg`/Xcode archiving for macOS, NSIS/Inno Setup/WiX for Windows.
- Windows/Linux tray — unscheduled, revisit only once macOS is working and it's actually needed. The spawn + health-poll logic (`ProcessManager`/`ChildProcess`) is platform-agnostic; only the tray UI would need porting. Reference notes below.

### Windows/Linux reference (not implemented)

Kept in case Windows/Linux support is picked up later. Since this design dropped the OS-service model in favor of app-owned child processes, a future Windows tray would follow the same pattern (WinForms app spawns children directly) rather than Task Scheduler.

**Windows: C# WinForms tray** (`NotifyIcon`), targets .NET 8, built with `dotnet build -c Release`:
```
tray/windows/
├── OpenUniRecorder.csproj
├── build.ps1           ← builds + copies exe to %LOCALAPPDATA%\Programs\OpenUniRecorder\
├── Program.cs          ← entry point
├── TrayApp.cs          ← NotifyIcon, context menu, process supervision, status polling
```
Added to `shell:startup` (`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\OpenUniRecorder.lnk`) for auto-start. First launch triggers a SmartScreen warning — user clicks "More info" → "Run anyway" once (same category of one-time friction as macOS Gatekeeper).

**Linux: no service needed either** — a tray app (e.g. via a GTK/Qt binding or Electron) would spawn children the same way; a systemd user unit is unnecessary under this design.
