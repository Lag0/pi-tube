# External Integrations

**Analysis Date:** 2026-03-02

## APIs & External Services

**Media Source:**
- YouTube (via `yt-dlp`) - source for video/audio ingestion in `pi_tube/downloader.py`
  - SDK/Client: `yt-dlp` Python library
  - Auth: none in code (public URL-based extraction)
  - Endpoints used: abstracted by `yt_dlp.YoutubeDL` internals

**Speech-to-Text:**
- Deepgram - transcription with diarization and summary in `pi_tube/transcribe/deepgram.py`
  - SDK/Client: `deepgram-sdk`
  - Auth: `DEEPGRAM_API_KEY`
  - Features used: `nova-3`, language detection, diarization, summary

- Groq - transcription in `pi_tube/transcribe/groq.py`
  - SDK/Client: `groq`
  - Auth: `GROQ_API_KEY`
  - Features used: `whisper-large-v3-turbo`, verbose JSON response

**Version Metadata Check:**
- GitHub raw content - update check in `pi_tube/utils.py`
  - Integration method: `urllib.request.urlopen` to `raw.githubusercontent.com/Lag0/pi-tube/master/pyproject.toml`
  - Auth: none
  - Timeout: 2 seconds

## Data Storage

**Databases:**
- None detected

**File Storage:**
- Local filesystem only
  - Temporary audio/cache: `~/pi-tube/.tmp` (from `Config.DEFAULT_TEMP_DIR`)
  - Final transcription output: `~/pi-tube` by default (`Config.DEFAULT_OUTPUT_DIR`)

**Caching:**
- Filesystem-based reuse only (e.g., existing downloaded audio and existing transcript checks)

## Authentication & Identity

**Auth Provider:**
- None for end users (CLI tool)

**Service Credentials:**
- API keys loaded from env/config file at process startup (`pi_tube/config.py`)
- Providers are considered configured when key string is non-empty (`is_configured()` implementations)

## Monitoring & Observability

**Error Tracking:**
- None detected

**Analytics:**
- None detected

**Logs:**
- Rich console output for operational feedback and errors
- No centralized log sink integration

## CI/CD & Deployment

**Hosting:**
- Not applicable (distributed as local CLI)

**CI Pipeline:**
- Not detected (`.github/workflows` absent)

## Environment Configuration

**Development:**
- Required env vars: `DEEPGRAM_API_KEY`, `GROQ_API_KEY`
- Secrets location: `.env` (project root, gitignored) or `~/.config/pi-tube/config`
- External binary dependency: `ffmpeg`

**Production/User Runtime:**
- Same key requirements as development
- Install path driven by `uv tool install` in `install.sh`

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None (tool initiates direct API requests only)

---

*Integration audit: 2026-03-02*
*Update when adding/removing external services*
