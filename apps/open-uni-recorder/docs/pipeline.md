# New Lecture Pipeline

Full flow from UI action to persisted summary for a lecture with status `pending`.

---

## 1. Setup: adding a lecture

User opens `/classes/:classId` (class-detail.html) and clicks "+ הוסף הרצאה".

```
POST /api/classes/:classId/lectures
{ name, url, lectureDate?, tags? }
```

`createLecture()` in `src/storage.js` writes `data/classes/:classId/lectures/:lectureId/meta.json` with `status: 'pending'`. No audio work happens yet.

---

## 2. UI trigger

### Class page (class-detail.html)

The class-detail table shows "▶ סכם" for `pending` and `error` lectures. Clicking it calls `runPipeline(lectureId)`, which first checks what files actually exist before deciding what to run:

```js
const [hasTranscript, hasSummary] = await Promise.all([
  fetch('.../transcript').then(r => r.ok),
  fetch('.../summary').then(r => r.ok),
]);
if (!hasTranscript) await streamSSE_bg('.../transcribe', lectureId, {});
if (!hasSummary)    await streamSSE_bg('.../summarize', lectureId, { backend });
```

This makes the button safe to press at any status — it only runs the stages whose output is actually missing, regardless of what `meta.json` says. Both calls run in the background; progress messages update the row badge in real time. If both files already exist, the row stays as-is and no API calls are made.

For `transcribed` lectures the table shows "▶ סכם" which calls `runSummarize(lectureId)` (summarize-only, no file check needed).

### Lecture page (lecture.html) — three distinct flows

The lecture detail page exposes three independent actions in the sidebar:

| Button | Function | Behavior |
|--------|----------|----------|
| 🔄 סכם מחדש | `runSummarize()` | Background only — no overlay. Checks if `transcript.txt` exists first. If missing, runs transcribe in background (button text shows progress). Summarization tokens stream live into the summary card; button text updates with SSE progress messages throughout. |
| 🔄 תמלל מחדש | `runRetranscribe()` | Background only — no overlay. Button text updates with SSE progress messages. On done, always fetches and displays the new transcript, and auto-opens the transcript panel. |
| 🧪 תמלל 30 דקות (בדיקה) | `runRetranscribe(true)` | Same as above but passes `{test:true}` to the server, which limits ffmpeg to the first 30 minutes (`-t 1800`). Useful for verifying transcription quality quickly. |

All three use `streamSSE_bg_lecture()`, a local helper equivalent to `streamSSE_bg` on the class page.

---

## 3. Transcription SSE

**Route:** `POST /api/classes/:classId/lectures/:lectureId/transcribe`  
**Handler:** `src/routes/classes.js:75`

### 3a. Browser login — `lib/extract.js`

Playwright launches headless Chromium and navigates to the OPAL SSO login page. It fills three fields:
- `#p_user` ← `OPENU_USERNAME`
- `#p_mis_student` ← `OPENU_ID`
- `input[type="password"]` ← `OPENU_PASSWORD`

After form submit it waits for a redirect to `opal.openu.ac.il`. If the landed URL doesn't include that domain, it throws immediately with a credentials hint.

Next, it registers a request interceptor watching for any `.m3u8` URL. It then navigates to the lecture page and clicks `#playlist{v}` (where `v` is the `?v=` URL param). The player iframe fires the HLS request automatically — the interceptor captures it within 20s. If the interceptor misses it (e.g. the request came from an iframe cross-origin context), a fallback reads `video.currentSrc` directly from the DOM, including inside iframes.

On any failure: saves a screenshot to `tmp/debug-screenshot.png`; if `DEBUG=true`, also writes the raw page HTML to `/tmp/openu-debug.html`.

Returns: HLS manifest URL (`*.m3u8` on `souvod.bynetcdn.com`).

### 3b. Download + concurrent transcription — `lib/download.js:downloadAndTranscribe()`

A single ffmpeg process runs two output passes simultaneously:

```
ffmpeg -i <hls_url>
  -vn -acodec libmp3lame -q:a 4  audio.mp3          ← saves full audio
  -vn -ac 1 -ar 16000 -acodec pcm_s16le
  -f segment -segment_time 600 -reset_timestamps 1
  tmp/chunk_%03d.wav                                 ← 10-min WAV segments
```

A polling loop runs every 2s. When `chunk_N+1.wav` exists, `chunk_N.wav` is sealed and enqueued for transcription. This means transcription of early chunks starts before ffmpeg finishes downloading.

When all enqueued chunks are done but ffmpeg hasn't sealed the next one yet, the poll emits a Hebrew "waiting for next segment" message every 2s — both via SSE (updates the browser button text) and via `process.stdout.write` (updates the terminal line).

Concurrency is controlled by `WHISPER_CONCURRENCY` (default 2 for Groq free tier). The queue in `runTranscribeQueue()` dispatches at most that many parallel requests.

### 3c. Whisper transcription — `lib/transcribe.js` + `lib/backends/whisper-groq.js`

Each WAV chunk is sent to Groq's Whisper API:
- Model: `whisper-large-v3-turbo`
- Language: `he` (Hebrew)
- Format: `verbose_json` with segment timestamps
- Prompt: seeded from `WHISPER_PROMPT` env var (default: academic Hebrew hint)

Returns `{text, segments: [{startSec, text}]}`. The WAV file is deleted immediately after.

**Rate limiting:** On 429, `whisper-groq.js` retries up to 5 times with exponential backoff (honouring `retry-after` header). If all retries fail, `lib/transcribe.js` catches the 429 and falls back to local `whisper-cpp` instead of propagating the error.

**Timestamp formatting:** `buildChunkText()` in `download.js` groups segments and inserts an absolute `[HH:MM]` timestamp every 60s. `chunkIdx * 600 + seg.startSec` gives the absolute time across the full lecture.

### 3d. Transcript assembly

After ffmpeg exits, any remaining unsealed chunks are drained and enqueued. All chunk results are sorted by index and joined with `\n`. The final string is written to `data/classes/:classId/lectures/:lectureId/transcript.txt`.

If `DELETE_MP3_AFTER_TRANSCRIBE=true`, `audio.mp3` is deleted at this point.

`meta.json` is updated: `status: 'transcribed'`, `whisperModel`, `whisperBackend`.

SSE closes with `{type: 'done', status: 'transcribed'}`.

---

## 4. Summarization SSE

**Route:** `POST /api/classes/:classId/lectures/:lectureId/summarize`  
**Handler:** `src/routes/classes.js:128`

Reads `transcript.txt`. Returns HTTP 400 immediately if it doesn't exist or is empty.

### 4a. Backend selection — `lib/summarize.js`

`getSummarizer(backend)` dynamically imports `lib/backends/summarize-{backend}.js`. If no backend is passed in the request body, falls back to `SUMMARIZE_BACKEND` env var (default: `gemini`).

All backends export the same interface:
- `summarizeChunk(text)` — for Gemini and Claude this is a no-op passthrough
- `mergeSummaries(chunks, onProgress, onToken)` — receives the full transcript as a single-element array, streams tokens via `onToken`

### 4b. Summarization (Gemini example)

The prompt (shared via `lib/backends/prompt.js`) instructs the model in English to respond in Hebrew, fully and without cutting content short. Sections: main topics, definitions, examples, conclusions — with `[HH:MM]` timestamp references.

Output token limit for merge calls is controlled by `MERGE_MAX_TOKENS` (defined in `lib/config.js`, currently 8192). Claude and Gemini both use this constant. Groq and Ollama manage their own limits internally since they use a chunked architecture.

`mergeSummaries` calls `generateContentStream()` and forwards each text delta as `{type: 'token', token}` over SSE. The client accumulates tokens and re-renders the markdown on each `requestAnimationFrame`.

On `MAX_TOKENS` finish reason, a Hebrew truncation warning is appended.

### 4c. Persistence

`summary.md` is written to the lecture directory. `meta.json` is updated: `status: 'summarized'`, `summarizedAt`, `summarizeBackend`.

SSE closes with `{type: 'done', summary, status: 'summarized'}`.

---

## 5. Final state

```
data/classes/:classId/lectures/:lectureId/
  meta.json        ← status: 'summarized', timestamps, backend info
  audio.mp3        ← present unless DELETE_MP3_AFTER_TRANSCRIBE=true
  transcript.txt   ← timestamped Hebrew transcript
  summary.md       ← structured Hebrew markdown summary
```

The class-detail table reloads and shows the lecture as "סוכם" with a link to `/classes/:classId/lectures/:lectureId`.

---

## SSE reconnection

When a client navigates away during transcription or summarization, the server-side job keeps running. On return:

- **Transcription**: the lecture page sees `status: 'transcribing'` on load and immediately POSTs to `/transcribe` again. The server detects the active job in `activeJobs` (an in-memory `EventEmitter` map keyed by `classId/lectureId`) and attaches the new SSE client to the existing event bus — no new job is started. All subsequent progress events are broadcast to every attached client.
- **Summarization**: the page sees `status: 'summarizing'` and polls `/status` every 2s until the status changes, then loads the result.

The `activeJobs` map is cleared on job completion or error. If the server restarts mid-job, the next POST starts a fresh job.

---

## Error handling

| Stage | What happens |
|-------|-------------|
| Login fails | Playwright throws; screenshot saved to `tmp/`; SSE sends `{type:'error'}`; `meta.json` status → `'error'` |
| HLS not intercepted | Throws after 20s timeout with hint to use `DEBUG=true` |
| ffmpeg exits non-zero | Throws immediately |
| ffmpeg stalls (no `time=` for 3 min) | Watchdog kills with SIGKILL → drains already-sealed chunks → saves partial transcript with a Hebrew warning appended; status becomes `'transcribed'` |
| Groq 429 (Whisper) | Retry with backoff → fallback to local whisper-cpp |
| Groq 429 (all retries exhausted) | whisper-cpp fallback |
| Summarizer error | SSE sends `{type:'error'}`; meta.json status unchanged |

Re-running from `status: 'error'` on the class page calls `runPipeline()`, which checks actual files and only re-runs what is missing.

From the lecture detail page, "🔄 תמלל מחדש" always re-transcribes unconditionally; "🔄 סכם מחדש" checks for a transcript first and transcribes in background if it is absent.
