# In-process transcription, no Redis

open-uni is distributed as a local app that users clone and run themselves, so we dropped the BullMQ/Redis transcription queue: a required Redis server (and the `QUEUE_ENCRYPTION_KEY` that only existed to encrypt Redis payloads) made clone-and-run harder for no benefit to a single local user. Transcription now runs in the API process, capped only by the per-user job slot; credentials stay in memory and are never persisted.

## Consequences

- A transcription in flight when the process stops is lost; on boot, lectures stuck in `transcribing` are reset to `pending` with an "interrupted" error so the user can retry.
- No global concurrency cap — fine for one local user. Bring back a queue (BullMQ/Redis or similar) if the app returns to a shared multi-user server or the API/worker split (#9) gets a real driver.
