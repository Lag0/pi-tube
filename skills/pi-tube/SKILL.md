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
- Provider credentials configured with `pi-tube auth login <deepgram|groq|elevenlabs>` or via environment fallback (`DEEPGRAM_API_KEY` / `GROQ_API_KEY` / `ELEVENLABS_API_KEY`).

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
pi-tube transcribe "./recording.mp3" --timestamps
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
- Existing output files are reused (smart skip). Delete the file to force a new transcription.

## Provider Choice

| Case | Provider |
|------|----------|
| Default: short videos, reels, single-speaker content | `groq` (Whisper) — fast and cheap |
| Long (> ~20 min) or complex media: lives, calls, interviews, multiple speakers, heavy jargon or noise | `--provider elevenlabs` (Scribe v2) — best quality |
| Avoid for now | `deepgram` — currently returns lowercase text without punctuation |

- Always pass `--language` matching the audio. With a mismatched language (e.g. default `pt` on English audio) Whisper translates instead of transcribing.
- Groq rejects files above 25MB; use ElevenLabs for long audio.
- Fallback may switch providers silently: check `provider` in the output frontmatter/JSON.

## Auth-Gated Sources

The bundled yt-dlp call sends no cookies. When a source needs a session, download with yt-dlp first and transcribe the local file:

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
- Precedence: CLI flags > config defaults > env defaults.
- Stored API keys are masked in output and saved in `~/.pi-tube/config.json` with restricted permissions.
- Environment variables remain automatic fallback; no env-link setup command is needed.
- If no provider credential is configured, CLI exits early with deterministic error guidance.
- If selected provider fails with auth/unavailable/failed and an alternate provider is configured, CLI can fallback automatically.
- Instagram private/auth-gated URLs fail with `INSTAGRAM_AUTH_REQUIRED`.
- For release quality gates, run `bun test` and `bun run verify:fixtures`.
