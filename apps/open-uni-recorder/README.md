# Open University Video Summarizer 🎓

Automatically logs in to the Open University (OPAL), extracts the video stream,
transcribes it with Whisper (via Groq API), and summarizes it using an LLM.

## Setup

### 1. Install Node dependencies
```bash
npm install
```

### 2. Install Playwright browser
```bash
npx playwright install chromium
```

### 3. Configure credentials
```bash
cp ..env .env
# then edit .env with your details
```

`GROQ_API_KEY` is required — it is used for both transcription (Whisper) and summarization (LLaMA).  
`GEMINI_API_KEY` is optional — enables Gemini as a fallback summarization backend.

## Usage

```bash
node summarize.js "https://opal.openu.ac.il/mod/ouilvideocollection/view.php?v=895284"
```

This will produce:
- `transcript.txt` — full Hebrew transcription
- `summary.md` — structured summary in Hebrew

## Backends

| Variable | Default | Options |
|---|---|---|
| `WHISPER_BACKEND` | `groq-whisper` | `groq-whisper`, `nodejs-whisper` |
| `SUMMARIZE_BACKEND` | `gemini` | `groq`, `gemini`, `ollama` |
| `WHISPER_CONCURRENCY` | `2` | Number of parallel transcription requests |

## Rate Limits (Groq Free Tier)

- **Whisper**: 7,200 audio-seconds/hour. A 2.5h lecture may take up to 75 min wall time due to this limit. The app retries automatically on 429 errors with exponential backoff.
- **LLaMA**: 30 requests/minute. Per-chunk summarization uses `llama-3.1-8b-instant` (fast), merge uses `llama-3.3-70b-versatile` (quality).

## How it works

```
Login (Playwright SSO) 
    → Extract video stream URL (Kaltura/HLS)
    → Download audio (ffmpeg, chunked into 10-min WAV segments)
    → Transcribe each chunk (Groq Whisper API, parallel)
    → Summarize each chunk (LLaMA 8B via Groq)
    → Merge summaries into one (LLaMA 70B via Groq)
    → Output transcript.txt + summary.md
```

## Notes

- The Open University uses Kaltura for video hosting — the tool intercepts
  the network requests from the player to find the HLS stream URL
- Long lectures (2h+) are chunked into 10-minute segments, transcribed in parallel, then merged
- Truncated summaries are detected and flagged with a warning in the output
