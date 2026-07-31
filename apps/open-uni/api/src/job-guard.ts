// Per-user cap on concurrent Playwright/ffmpeg/Whisper jobs (transcribe, detect, sync).
// Protects server resources and the shared OPAL login IP from one user's jobs stacking up.
const active = new Set<string>();

export function tryAcquireJobSlot(userId: string): boolean {
  if (active.has(userId)) return false;
  active.add(userId);
  return true;
}

export function releaseJobSlot(userId: string): void {
  active.delete(userId);
}
