# pi-tube

## What This Is

pi-tube is an agent-first CLI + skill that ingests public video/audio sources and produces structured transcription artifacts for knowledge extraction and feature implementation workflows. In v1, the project performs a full cutover from the existing Python CLI to TypeScript + Bun as the primary runtime while preserving the `pi-tube` identity. The product serves both AI agents and humans, with deterministic outputs designed for reliable machine parsing.

## Core Value

Turn public media inputs into trustworthy, structured, ready-to-use knowledge artifacts fast.

## Requirements

### Validated

- ✓ User can transcribe YouTube videos through CLI commands (`pi_tube/cli.py` + `pi_tube/downloader.py`) — existing
- ✓ User can transcribe local audio/video files through CLI commands (`pi_tube/cli.py` + `pi_tube/audio.py`) — existing
- ✓ User can use cloud transcription providers (Deepgram and Groq) via provider abstraction (`pi_tube/transcribe/*.py`) — existing
- ✓ User can configure API keys via env/config file and CLI config subcommands (`pi_tube/config.py`, `pi_tube/cli.py`) — existing

### Active

- [ ] v1 performs complete runtime cutover to TypeScript + Bun while keeping `pi-tube` package/bin identity
- [ ] v1 supports ingestion from YouTube URLs, Instagram public post/reel/video URLs, direct media URLs, and local files
- [ ] v1 enforces public-only Instagram handling (no login/cookies) with explicit `INSTAGRAM_AUTH_REQUIRED` failures when auth is required
- [ ] v1 accepts only direct downloadable media URLs (or local files) outside platform-specific extractors; non-direct URLs fail with `UNSUPPORTED_URL_NOT_DIRECT_MEDIA`
- [ ] v1 outputs deterministic structured Markdown with YAML frontmatter schema
- [ ] v1 supports optional deterministic JSON output (`--json`) including `schema_version`, equivalent to Markdown content
- [ ] v1 includes fixed summary format: 1 paragraph (2-4 sentences) + 5 key-point bullets
- [ ] v1 standardizes actionable error codes for agent workflows (`AUTH_REQUIRED` family, `UNSUPPORTED_SOURCE`, `DOWNLOAD_FAILED`, `TRANSCRIBE_FAILED`)
- [ ] v1 ships skill/CLI documentation that is agent-first with explicit `--json` usage guidance and golden sample output fixture

### Out of Scope

- Authenticated/private media extraction (cookies, sessions, login scraping) — excluded for compliance, stability, and maintenance risk
- Generic HTML page/player extraction — deferred due to low determinism and high breakage surface
- Instagram Stories/Live — excluded from v1 to keep scope on stable public post/reel/video flows
- Local/offline transcription fallback engines (e.g., local Whisper) — deferred beyond v1; cloud providers remain standard
- Repository/package rename away from `pi-tube` — deferred to v2+ to avoid migration churn

## Context

Current state is a brownfield Python CLI (`pi_tube`) with working YouTube download, local file support, ffmpeg conversion, and Deepgram/Groq transcription. The project already has `.planning/codebase/` mapping documents that describe architecture, conventions, integrations, and risks. The new milestone shifts execution to TypeScript + Bun, expands supported public sources (including Instagram public URLs), and formalizes output/error contracts for agent-driven usage similar to AI tooling CLIs.

## Constraints

- **Tech Stack**: TypeScript + Bun as v1 primary runtime — complete cutover from Python path is required
- **Compatibility**: Keep `pi-tube` repo/package/bin identity — avoid rename churn in v1
- **Source Policy**: Public-only media ingestion for Instagram — no auth/cookies/session scraping allowed
- **Input Scope**: Only direct media URLs plus explicitly supported platform URLs — no generic embedded-player extraction in v1
- **Output Contract**: Deterministic Markdown schema and deterministic optional JSON (`--json`) — required for agent parsing reliability
- **Operational Reliability**: Explicit machine-readable error codes and non-zero exits for failures — required for automation safety

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Evolve existing `pi-tube` codebase instead of rebuilding from zero | Lower time-to-value using validated flows while refactoring incrementally | — Pending |
| Perform full v1 cutover to TypeScript + Bun | Align runtime with target ecosystem and future maintainability goals | — Pending |
| Keep `pi-tube` name/package/bin in v1 | Avoid migration overhead and preserve existing user habits | — Pending |
| Treat Instagram public videos/posts/reels as core v1 source | Meets key product goal despite known platform volatility | — Pending |
| Enforce public-only Instagram policy with explicit auth-required failures | Reduces legal/operational risk and keeps behavior deterministic | — Pending |
| Restrict generic URL ingestion to direct downloadable media only | Prevents unstable HTML extraction complexity in v1 | — Pending |
| Default output to Markdown; JSON is optional via `--json` | Keeps CLI human-friendly while enabling agent determinism | — Pending |
| Standardize summary as fixed 1 paragraph + 5 bullets | Improves consistency for downstream parsing and QA | — Pending |
| Define stable error-code taxonomy and golden sample fixture as v1 gate | Ensures reliability for agent automation and regression detection | — Pending |

---
*Last updated: 2026-03-02 after initialization*
