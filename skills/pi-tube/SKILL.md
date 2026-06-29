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
- Successful transcriptions print `[OUTPUT_FILE]` and `[OUTPUT_FILE_URI]`.
- Successful downloads print `[DOWNLOAD_FILE]` and `[DOWNLOAD_FILE_URI]`.

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
