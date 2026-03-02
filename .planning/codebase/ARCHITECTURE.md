# Architecture

**Analysis Date:** 2026-03-02

## Pattern Overview

**Overall:** Monolithic CLI with provider abstraction

**Key Characteristics:**
- Single-process command execution through Typer
- Branching workflow based on input type (YouTube URL vs local media file)
- Swappable transcription providers via shared interface (`TranscriptionProvider`)

## Layers

**Command Layer:**
- Purpose: Parse CLI arguments/options and route to user-facing operations
- Contains: Command definitions and orchestration helpers in `pi_tube/cli.py`
- Depends on: Application services (downloader, audio, providers, config)
- Used by: Entry point `pi_tube.cli:main` (`[project.scripts]`)

**Media Processing Layer:**
- Purpose: Ingest media from source and normalize audio for transcription
- Contains: URL handling and download in `pi_tube/downloader.py`, conversion in `pi_tube/audio.py`
- Depends on: `yt-dlp`, `ffmpeg-python`, filesystem
- Used by: `_transcribe_with_provider()` in `pi_tube/cli.py`

**Provider Layer:**
- Purpose: Adapt external transcription APIs to a common contract
- Contains: `pi_tube/transcribe/base.py`, `deepgram.py`, `groq.py`
- Depends on: API SDKs and config/env keys
- Used by: `get_provider()` and transcription flow in CLI

**Configuration/Utility Layer:**
- Purpose: Centralize env/config loading and small shared helpers
- Contains: `pi_tube/config.py`, `pi_tube/utils.py`
- Depends on: `dotenv`, stdlib
- Used by: All other layers

## Data Flow

**CLI Transcription Flow:**

1. User runs `pi-tube deepgram ...` or `pi-tube groq ...`
2. Typer dispatches to command function in `pi_tube/cli.py`
3. `_transcribe_with_provider()` validates provider configuration
4. Input source is classified:
   - YouTube URL -> metadata lookup + download via `download_audio()`
   - Local media -> format validation + optional `extract_audio()`
5. Selected provider transcribes via `transcribe()`
6. `TranscriptionResult.save()` writes output markdown/text file
7. Temporary audio is removed unless `--keep-audio` is set

**Download-only Flow:**

1. User runs `pi-tube dl <url>`
2. URL validation through `is_youtube_url()`
3. Download route selects audio (default) or video path
4. Output path is printed to console

**State Management:**
- Stateless process execution per command invocation
- Persistent state only through local files (config and outputs)

## Key Abstractions

**TranscriptionProvider interface:**
- Purpose: Uniform contract for heterogeneous transcription services
- Examples: `DeepgramProvider`, `GroqProvider`
- Pattern: Strategy pattern via runtime provider selection

**TranscriptionResult dataclass:**
- Purpose: Standard output payload from providers
- Examples: Created in `pi_tube/transcribe/deepgram.py` and `pi_tube/transcribe/groq.py`
- Pattern: Value object with persistence helper `save()`

**Config class:**
- Purpose: Central constants + directory helper methods
- Examples: `ensure_temp_dir()`, `ensure_output_dir()` in `pi_tube/config.py`
- Pattern: Static/class-based configuration holder

## Entry Points

**Package CLI entry point:**
- Location: `pi_tube/cli.py` (`main()` and Typer `app`)
- Triggers: `pi-tube` command installed via project scripts
- Responsibilities: Parse command input and orchestrate operations

**Standalone script entry point:**
- Location: `main.py`
- Triggers: `python main.py`
- Responsibilities: Placeholder output only (not part of main CLI architecture)

## Error Handling

**Strategy:** Raise domain errors in lower layers, convert to user-facing CLI exits at command boundaries.

**Patterns:**
- Providers and media modules raise `ValueError` / `FileNotFoundError`
- Top-level command flows catch broad exceptions and call `raise typer.Exit(1)`
- Deepgram provider maps specific API status codes (401, 429, >=500) to clearer error messages

## Cross-Cutting Concerns

**Logging/UI Feedback:**
- Rich console output for status, success and error messages across modules

**Validation:**
- Input validation at CLI boundary (URL format, file existence/format)
- Provider config validation through `is_configured()` checks before network calls

**Configuration Loading:**
- Environment/config file loading occurs at import time in `pi_tube/config.py`

---

*Architecture analysis: 2026-03-02*
*Update when major patterns change*
