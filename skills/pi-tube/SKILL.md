---
name: pi-tube
description: |
  Official pi-tube CLI skill for deterministic media transcription workflows.

  USE FOR:
  - YouTube/Instagram/direct URL/local file transcription via CLI
  - Deterministic Markdown/JSON artifact generation
  - Provider auth/default configuration flows
  - Media downloads via yt-dlp

  Must be pre-installed. See rules/install.md for installation and setup, and rules/security.md for output handling.
allowed-tools:
  - Bash(pi-tube *)
---

# Pi-Tube CLI

Deterministic transcription CLI focused on agent-friendly output contracts.

Run `pi-tube --help` for current command details.

## Prerequisites

- `pi-tube` available in PATH.
- Provider credentials configured with `pi-tube auth login <deepgram|groq|elevenlabs>` or via environment variables (`DEEPGRAM_API_KEY` / `GROQ_API_KEY` / `ELEVENLABS_API_KEY`), which win over a stored key.

If not installed, follow [rules/install.md](rules/install.md).
For output safety and untrusted content handling, follow [rules/security.md](rules/security.md).

## Quick Checks

```bash
pi-tube --version
pi-tube --help
pi-tube help transcribe
pi-tube help auth
pi-tube auth status
pi-tube defaults show
```

## Typical Workflow

1. Configure credentials and defaults:

```bash
pi-tube auth login <deepgram|groq|elevenlabs>
pi-tube auth status
pi-tube defaults provider <deepgram|groq|elevenlabs>
pi-tube defaults language pt-BR
pi-tube defaults show
```

2. Run transcription:

```bash
pi-tube transcribe <input>
pi-tube transcribe "https://youtube.com/watch?v=dQw4w9WgXcQ" --provider groq --language pt --json
```

3. Download media when needed:

```bash
pi-tube download <url>
pi-tube download "https://youtube.com/watch?v=dQw4w9WgXcQ" --audio
pi-tube download "https://instagram.com/reel/abc123" --output ./media
```

4. Inspect output:

- Default transcription output: deterministic markdown artifact.
- `transcribe --json`: deterministic schema-versioned JSON contract.
- YouTube sources include source metadata (`published_at`, `description`, `description_links`) under `source` in JSON and a `## Source Metadata` section in Markdown when present.
- Successful transcriptions print `[OUTPUT_FILE]` and `[OUTPUT_FILE_URI]`. Read the path from that line instead of rebuilding it: the file name lowercases the media id and turns `_` into `-`.
- A transcript already in the library (same source, provider, model and language) is reused without a new provider call; pass `--force` to transcribe again.

## Provider Choice

| Case | Provider |
|------|----------|
| Default: short videos, reels, single-speaker content | `groq` (Whisper) — fast and cheap |
| Long (> ~20 min) or complex media: lives, calls, interviews, multiple speakers, heavy jargon or noise | `--provider elevenlabs` (Scribe v2) — best quality |

- Always pass `--language` matching the audio. With a mismatched language (e.g. default `pt` on English audio) Whisper translates instead of transcribing.
- Groq rejects files above 25MB; use ElevenLabs for long audio.
- pi-tube never switches providers on its own: check `provider` in the output frontmatter/JSON.

## Auth-Gated Sources

pi-tube passes yt-dlp the cookies file set by `cookies.file` (`pi-tube config set cookies.file <absolute path>`) or `PI_TUBE_COOKIES_FILE`: a cookies.txt in Netscape format exported from a browser where you are logged in. Without one, a source that needs a session fails with `SOURCE_AUTH_REQUIRED`. Alternatively, download with yt-dlp first and transcribe the local file:

```bash
yt-dlp --cookies-from-browser chrome -f bestaudio -x --audio-format mp3 --write-info-json -o "./media/%(id)s.%(ext)s" "<url>"
pi-tube transcribe "./media/<id>.mp3" --language en
```

- YouTube "Sign in to confirm you're not a bot" and Instagram "empty media response" both need a logged-in browser session.
- Use the browser that actually holds the session. For browsers yt-dlp does not support natively (e.g. Arc), export only the needed domain's cookies to a temporary Netscape jar (`browser-cookie3`), pass `--cookies <jar>`, and delete the jar afterwards.
- `--write-info-json` keeps channel, title, upload date and duration for note metadata.

## Key Commands

```bash
pi-tube transcribe <input>
pi-tube transcribe <input> --provider <deepgram|groq|elevenlabs> --language <code> --json
pi-tube download <url>
pi-tube auth login <deepgram|groq|elevenlabs>
pi-tube auth status
pi-tube auth logout <deepgram|groq|elevenlabs>
pi-tube defaults provider <deepgram|groq|elevenlabs>
pi-tube defaults language <code>
pi-tube defaults show
pi-tube setup yt-dlp
pi-tube setup skills --global --yes
```

## Notes

- v2 uses explicit transcription: always call `pi-tube transcribe <input>`.
- Precedence: CLI flags > env defaults (`PI_TUBE_TRANSCRIPTION_PROVIDER`, `PI_TUBE_TRANSCRIPTION_LANGUAGE`) > config defaults; with no provider chosen, the first provider that has a key.
- API keys are never printed, not even masked; stored keys live in `~/.pi-tube/config.json` (mode 600).
- Environment variables win over a stored key (`pi-tube providers` shows each `key_source`); no env-link setup command is needed.
- If no provider credential is configured, CLI exits early with deterministic error guidance.
- If the selected provider fails, pi-tube does not fall back to another one: the error stands, and on a rate limit or outage the hint names the other configured providers.
- Instagram private/auth-gated URLs fail with `SOURCE_AUTH_REQUIRED` (exit 5); a cookies file (`cookies.file`) gives access.
- For release quality gates, run `bun test` and `bun run verify:fixtures`.
