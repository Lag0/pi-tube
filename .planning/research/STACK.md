# Stack Research

**Domain:** Agent-first media ingestion + transcription CLI (TypeScript/Bun)
**Researched:** 2026-03-02
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Bun | 1.3.10 | Runtime, package manager, script runner, single-binary tooling | Native TS ergonomics, fast startup, and clean fit for CLI + `npx skills.sh` ecosystem |
| TypeScript | 5.9.3 | Type-safe CLI and pipeline implementation | Strong static contracts for stable schemas, error codes, and provider adapters |
| yt-dlp (binary integration) | 2026.2.21 | Source extraction/download for YouTube + Instagram public URLs | Mature extractor ecosystem and proven support model for site-specific volatility |
| ffmpeg | 6.x/7.x (system) | Audio normalization for transcription | Required for robust media handling and provider-friendly audio preprocessing |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| commander | 14.0.3 | CLI command parsing and subcommand structure | Primary command surface (`transcribe`, `download`, `providers`, `config`) |
| zod | 4.3.6 | Runtime validation for config/input/output schemas | Validate all external inputs and output schema generation paths |
| execa | 9.6.1 | Controlled subprocess execution | Invoke `yt-dlp`/`ffmpeg` safely with timeouts and structured stderr capture |
| @deepgram/sdk | 4.11.3 | Deepgram API integration | Cloud transcription path with diarization/summarization options |
| groq-sdk | 0.37.0 | Groq speech-to-text integration | Fast multilingual transcription (`whisper-large-v3-turbo`) |
| gray-matter | 4.0.3 | YAML frontmatter parsing/serialization | Deterministic Markdown output with metadata envelope |
| js-yaml | 4.1.1 | Explicit YAML processing | Stable YAML representation for schema versioning |
| pino | 10.3.1 | Structured logging | Machine-readable diagnostics for agent workflows |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Vitest (4.0.18) | Unit/integration testing | Validate schema parity (Markdown vs JSON) and error-code behavior |
| Biome (2.4.5) | Formatting + linting | Keeps TS codebase consistent with low config overhead |
| GitHub Actions | CI checks | Run lint, tests, fixture/golden sample verification on every change |

## Installation

```bash
# Core
bun add commander zod execa @deepgram/sdk groq-sdk gray-matter js-yaml pino

# Dev dependencies
bun add -d typescript vitest @biomejs/biome @types/bun

# System dependencies (outside bun)
# - yt-dlp binary in PATH
# - ffmpeg binary in PATH
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Bun runtime | Node.js + pnpm | If org policy/tooling mandates Node LTS infrastructure |
| commander | oclif | If you need plugin architecture and larger enterprise CLI scaffolding |
| yt-dlp binary integration | Site-specific custom extractors | Only when licensing/compliance policy disallows yt-dlp usage |
| Cloud STT (Deepgram + Groq) | Local Whisper runtime | If offline operation is mandatory and latency/cost profile allows |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Generic HTML player scraping in v1 | High breakage and anti-bot churn per site | Direct media URLs + explicit supported platform extractors |
| Instagram auth/cookie scraping | Compliance and maintenance risk | Public-only best-effort extraction + explicit auth-required error |
| Unversioned output schemas | Breaks downstream agent consumers | `schema_version` in both Markdown frontmatter and JSON output |
| Silent provider/download failures | Non-deterministic automation behavior | Stable error codes + non-zero exits |

## Stack Patterns by Variant

**If agent automation is primary (default):**
- Use `--json` with deterministic schema + machine-readable error codes.
- Because automation reliability requires strict contracts.

**If human CLI usage is primary:**
- Use Markdown default output with frontmatter + readable summary.
- Because humans want immediate readable artifacts, while JSON stays opt-in.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Bun 1.3.10 | TypeScript 5.9.3 | Stable TS execution and package tooling path |
| @deepgram/sdk 4.11.3 | Bun/TS HTTP runtime | Validate request/response mapping in integration tests |
| groq-sdk 0.37.0 | Bun/TS fetch runtime | Supports transcription calls and verbose JSON outputs |
| commander 14.0.3 | TypeScript 5.9.3 | Works with typed command definitions |

## Sources

- Bun docs + release notes (`bun.sh`, Bun 1.3.10 release) — runtime direction and current version
- npm registry (`npm view`) — current package versions for TypeScript/CLI/libs
- PyPI index (`yt-dlp` 2026.2.21) — extractor binary version baseline
- yt-dlp README/extractor listing — platform extraction scope (including Instagram extractor family)
- Deepgram docs (model options, transcription features) — cloud STT capabilities
- Groq docs (speech-to-text) — model/parameter expectations and timestamp behavior

---
*Stack research for: agent-first media transcription CLI*
*Researched: 2026-03-02*
