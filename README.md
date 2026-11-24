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
pi-tube auth login groq
pi-tube defaults provider groq
pi-tube transcribe "https://youtube.com/watch?v=dQw4w9WgXcQ"
pi-tube download "https://youtube.com/watch?v=dQw4w9WgXcQ"
```

## Command Surface

Core:

- `pi-tube transcribe <input> [--provider <deepgram|groq|elevenlabs>] [--language <code>] [--json]`
- `pi-tube download <url> [--audio] [--output <dir>]`

Authentication:

- `pi-tube auth login <deepgram|groq|elevenlabs> [--stdin]`
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
pi-tube transcribe "./recording.mp3" --json
```

Providers: `deepgram`, `groq` (Whisper), and `elevenlabs` (ElevenLabs Scribe speech-to-text).

Successful runs write deterministic Markdown or JSON artifacts and print:

```text
[OUTPUT_FILE] /path/to/artifact.md
[OUTPUT_FILE_URI] file:///path/to/artifact.md
```

### Concurrent transcriptions

Ordinary CLI and MCP calls sharing a local library coordinate by final source key, provider, model and normalized requested language. One caller transcribes; concurrent callers wait for the saved transcript and report a zero-cost cache hit. Other keys run independently. Cancelling a waiter does not cancel the producer. `--force` still requests a new paid version and skips this coordination.

A caller that observes another claim only reads: it can reuse the canonical save even if the producer crashes or cannot release its claim. If the claim disappears without a save, or five minutes pass without a save, the waiter reports an error without dispatching again. This limit neither stops the producer nor proves it has exited. A failed release warns separately without changing the producer’s result. Before manually removing an abandoned empty `.transcribing-<transcript-id>` directory, stop all callers using that library and check the library and provider usage. A provider can bill before a save; this is not exactly-once billing or crash recovery.

## Download Media

```bash
pi-tube download "https://youtube.com/watch?v=dQw4w9WgXcQ"
pi-tube download "https://youtube.com/watch?v=dQw4w9WgXcQ" --audio
pi-tube download "https://instagram.com/reel/abc123" --output ./media
```

Defaults:

- video with audio is downloaded by default
- `--audio` downloads audio-only as mp3
- files are saved to `~/.pi-tube/downloads` unless `--output <dir>` is provided
- successful runs print `[DOWNLOAD_FILE]` and `[DOWNLOAD_FILE_URI]`
- requires `yt-dlp` on PATH; use `pi-tube setup yt-dlp` for guidance

## Auth and Defaults

Provider API keys are saved in `~/.pi-tube/config.json` (mode 600). Keys are never printed, not even masked.

```bash
pi-tube auth login elevenlabs
pi-tube auth status
pi-tube auth logout elevenlabs
```

Environment variables win over a stored key and need no configuration:

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

- Transcripts always keep their timestamps: timed segments in the JSON and timestamp blocks in the Markdown.
- `transcribe --json` emits a deterministic schema-versioned contract from the same canonical artifact model.
- YouTube sources carry extra source metadata for downstream reasoning: `published_at` (ISO date), `description` (full text), and `description_links` (ordered unique HTTP(S) links parsed from the description). JSON exposes them under `source` with deterministic `null`/empty-array defaults; Markdown renders a `## Source Metadata` section before `## Summary` only when at least one field is present.
- Temporary media downloads for YouTube/Instagram transcription use `~/.pi-tube/tmp` and are deleted after each run.
- `setup skills` installs the repository skill bundle (`skills/pi-tube`) into supported agent tooling.

## Preview transcript cleanup (source checkout)

Run `pi-tube library prune --include-transcripts --older-than 30 --json` to preview; add `--yes` to recheck and apply. `transcript_files`, `source_dirs` and `bytes` count planned or actual removals; `preserved` counts skipped items (an uninspected directory can count as one), and `failed` signals incomplete cleanup. `busy: true` means another library operation prevented the scan; no removal is planned or performed. Linked paths, personal files, edited artifacts and the library root are preserved. Legacy files without an independent identity receipt stay in place, even if their bytes match a regenerated transcript; new saves in the same folder remain eligible. No migration is required.

On a local Windows volume supporting POSIX-style deletion (such as modern NTFS), cleanup pins plain directories and verifies and deletes each file while holding the same Windows handle. Reads coordinate without writing marker files; the OS releases handles on process exit. On other volumes, Linux and macOS, preview and apply return `unsupported: true` with zero removals: there is no enabled identity-bound deletion backend. Audio-only pruning and automatic audio retention are separate operations.

## Release Hardening

Before tagging a release, run the mandatory checks in [docs/release-checklist.md](docs/release-checklist.md).

npm publish automation is defined in `.github/workflows/publish.yml` with provenance and version-exists checks.

## Instagram Public-Only Policy

- Supported URL classes: Instagram public post/reel/video URLs (for example `/p/...`, `/reel/...`, `/tv/...`).
- Auth-gated Instagram inputs fail with `SOURCE_AUTH_REQUIRED`.
- CLI exits non-zero on auth-required failures and prints remediation guidance to use publicly accessible URLs.

## Runtime Policy

The primary runtime path is Bun + TypeScript. Python runtime is not required.

## Provider Error Contract

Provider-layer failures are normalized to deterministic public codes:

- `PROVIDER_AUTH`
- `PROVIDER_RATE_LIMIT`
- `PROVIDER_UNAVAILABLE`
- `PROVIDER_FAILED`
- `PROVIDER_INVALID_RESPONSE`
