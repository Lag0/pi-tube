# pi-tube

`pi-tube` is a Bun + TypeScript CLI for transcribing and downloading public media.

Current delivery status: v2 CLI redesign with explicit `transcribe`, `download`, `auth`, and `defaults` commands.

## Install

```bash
npm install -g @syxs/pi-tube
```

Or run without global install:

```bash
npx -y @syxs/pi-tube --help
```

Local development:

```bash
git clone https://github.com/Lag0/pi-tube.git
cd pi-tube
bun install
```

## Quick Start

```bash
pi-tube auth login groq --key gsk_...
pi-tube defaults provider groq
pi-tube transcribe "https://youtube.com/watch?v=dQw4w9WgXcQ"
pi-tube download "https://youtube.com/watch?v=dQw4w9WgXcQ"
```

## Command Surface

Core:

- `pi-tube transcribe <input> [--provider <deepgram|groq|elevenlabs>] [--language <code>] [--timestamps] [--json]`
- `pi-tube download <url> [--audio] [--output <dir>]`

Authentication:

- `pi-tube auth login <deepgram|groq|elevenlabs> --key <api_key>`
- `pi-tube auth status`
- `pi-tube auth logout <deepgram|groq|elevenlabs>`

Defaults:

- `pi-tube defaults provider <deepgram|groq|elevenlabs>`
- `pi-tube defaults language <code>`
- `pi-tube defaults show`

Setup:

- `pi-tube setup yt-dlp`
- `pi-tube setup skills [--global] [--agent <name>] [--yes|--no-prompt]`

## Transcribe

```bash
pi-tube transcribe "https://youtube.com/watch?v=dQw4w9WgXcQ"
pi-tube transcribe "./recording.mp3" --provider elevenlabs --language pt-BR
pi-tube transcribe "./recording.mp3" --timestamps --json
```

Providers: `deepgram`, `groq` (Whisper), and `elevenlabs` (ElevenLabs Scribe speech-to-text).

Successful runs write deterministic Markdown or JSON artifacts and print:

```text
[OUTPUT_FILE] /path/to/artifact.md
[OUTPUT_FILE_URI] file:///path/to/artifact.md
```

## Download Media

```bash
pi-tube download "https://youtube.com/watch?v=dQw4w9WgXcQ"
pi-tube download "https://youtube.com/watch?v=dQw4w9WgXcQ" --audio
pi-tube download "https://instagram.com/reel/abc123" --output ./media
```

Defaults:

- video with audio is downloaded by default
- `--audio` downloads audio-only as mp3
- files are saved to `./downloads` unless `--output <dir>` is provided
- successful runs print `[DOWNLOAD_FILE]` and `[DOWNLOAD_FILE_URI]`
- requires `yt-dlp` on PATH; use `pi-tube setup yt-dlp` for guidance

## Auth and Defaults

Provider API keys are saved in `~/.pi-tube/config.json` with restricted file permissions. Command output always masks keys.

```bash
pi-tube auth login elevenlabs --key sk_...
pi-tube auth status
pi-tube auth logout elevenlabs
```

Environment variables remain automatic fallbacks and do not require configuration:

- `DEEPGRAM_API_KEY`
- `GROQ_API_KEY`
- `ELEVENLABS_API_KEY` (`ELEVEN_API_KEY` is also accepted)

Defaults avoid repeating common transcription flags:

```bash
pi-tube defaults provider elevenlabs
pi-tube defaults language pt-BR
pi-tube defaults show
```

## Legacy Raw Config

The old raw config command is kept as an undocumented compatibility escape hatch for scripts:

```bash
pi-tube config list
pi-tube config get defaults.provider
pi-tube config set defaults.provider groq
```

Prefer `auth` and `defaults` for human workflows.

## Agent Workflows

- Timestamp blocks are disabled by default; use `transcribe --timestamps` when needed.
- `transcribe --json` emits a deterministic schema-versioned contract from the same canonical artifact model.
- YouTube sources carry extra source metadata for downstream reasoning: `published_at` (ISO date), `description` (full text), and `description_links` (ordered unique HTTP(S) links parsed from the description). JSON exposes them under `source` with deterministic `null`/empty-array defaults; Markdown renders a `## Source Metadata` section before `## Summary` only when at least one field is present.
- Temporary media downloads for YouTube/Instagram transcription use `~/.pi-tube/tmp` and are deleted after each run.
- `setup skills` installs the repository skill bundle (`skills/pi-tube`) into supported agent tooling.

## Release Hardening

Before tagging a release, run the mandatory checks in [docs/release-checklist.md](docs/release-checklist.md).

npm publish automation is defined in `.github/workflows/publish.yml` with provenance and version-exists checks.

## Instagram Public-Only Policy

- Supported URL classes: Instagram public post/reel/video URLs (for example `/p/...`, `/reel/...`, `/tv/...`).
- Auth-gated Instagram inputs fail with `INSTAGRAM_AUTH_REQUIRED`.
- CLI exits non-zero on auth-required failures and prints remediation guidance to use publicly accessible URLs.

## Runtime Policy

The primary runtime path is Bun + TypeScript. Python runtime is not required.

## Provider Error Contract

Provider-layer failures are normalized to deterministic public codes:

- `TRANSCRIPTION_PROVIDER_AUTH`
- `TRANSCRIPTION_PROVIDER_RATE_LIMIT`
- `TRANSCRIPTION_PROVIDER_UNAVAILABLE`
- `TRANSCRIPTION_PROVIDER_FAILED`
- `TRANSCRIPTION_PROVIDER_INVALID_RESPONSE`
