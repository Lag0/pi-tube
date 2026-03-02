# Architecture Research

**Domain:** TypeScript/Bun CLI for media ingestion + transcription
**Researched:** 2026-03-02
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Layer                             │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │ transcribe │  │ download   │  │ providers  │            │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘            │
│        │               │               │                   │
├────────┴───────────────┴───────────────┴───────────────────┤
│                     Application Layer                        │
├─────────────────────────────────────────────────────────────┤
│ Source Resolver → Extractor Adapter → Media Normalizer      │
│                  → Transcription Engine → Output Renderer    │
├─────────────────────────────────────────────────────────────┤
│                     Infrastructure Layer                     │
│ yt-dlp/ffmpeg subprocesses, provider HTTP clients, fs, env  │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Source Resolver | Classify input (YouTube / Instagram public / direct URL / local file) | URL/file parser + policy checks |
| Extractor Adapter | Download/extract media | `execa` wrapper around `yt-dlp` and `ffmpeg` |
| Transcription Engine | Provider-agnostic STT orchestration | Interface + provider adapters (Deepgram, Groq) |
| Output Renderer | Write deterministic Markdown/JSON artifacts | Shared domain object -> dual renderers |
| Error Mapper | Normalize failures into stable codes | Typed error classes + exit-code mapping |

## Recommended Project Structure

```
src/
├── cli/                    # commander command definitions
│   ├── commands/           # transcribe/download/providers/config
│   └── index.ts            # CLI entrypoint
├── core/                   # domain logic
│   ├── source/             # source classification + policies
│   ├── media/              # download + normalize pipeline
│   ├── transcribe/         # provider interface + adapters
│   ├── output/             # markdown/json schema renderers
│   └── errors/             # typed errors and code mapping
├── infra/                  # external integrations
│   ├── ytdlp/              # yt-dlp subprocess wrapper
│   ├── ffmpeg/             # ffmpeg wrapper
│   └── providers/          # Deepgram/Groq clients
├── schemas/                # zod schemas + schema_version
├── skill/                  # skill docs/templates for AI systems
└── tests/                  # unit/integration/golden fixtures
```

### Structure Rationale

- **`core/`** keeps business rules independent from CLI and subprocess details.
- **`infra/`** isolates volatile dependencies (`yt-dlp`, provider APIs).
- **`schemas/`** centralizes output contract enforcement.
- **`tests/fixtures/`** enables deterministic golden sample validation.

## Architectural Patterns

### Pattern 1: Ports and Adapters (Hexagonal)

**What:** Core logic depends on interfaces, not concrete extractor/provider libraries.
**When to use:** External services/tools are volatile (Instagram behavior, API changes).
**Trade-offs:** Slightly more abstraction overhead; much easier replacement/testing.

**Example:**
```typescript
interface TranscriptionProvider {
  transcribe(input: NormalizedAudio, opts: TranscribeOpts): Promise<TranscriptResult>;
}
```

### Pattern 2: Deterministic Rendering Pipeline

**What:** Build one canonical transcript domain model, then render to Markdown and JSON.
**When to use:** Multiple output formats must remain semantically identical.
**Trade-offs:** Requires explicit mapping layer; prevents format drift.

**Example:**
```typescript
const canonical = buildCanonicalTranscript(rawProviderResponse);
writeMarkdown(renderMarkdown(canonical));
if (flags.json) writeJson(renderJson(canonical));
```

### Pattern 3: Error Taxonomy Boundary

**What:** Map internal exceptions to stable public error codes at CLI boundary.
**When to use:** Agent workflows require deterministic failure handling.
**Trade-offs:** Needs discipline to avoid leaked raw errors.

## Data Flow

### Request Flow

```
CLI command
    ↓
Source Resolver
    ↓
Extractor Adapter (yt-dlp/direct/local)
    ↓
Media Normalizer (ffmpeg)
    ↓
Provider Adapter (Deepgram/Groq)
    ↓
Canonical Transcript Model
    ↓
Markdown/JSON Renderer
```

### State Management

- Stateless command execution per run.
- Persistent artifacts only in output files and optional cache/dedup metadata.

### Key Data Flows

1. **Public URL flow:** validate source policy -> extract/download -> transcribe -> emit artifacts.
2. **Local file flow:** validate extension/mimetype -> normalize -> transcribe -> emit artifacts.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Individual CLI use | Single-process execution with local filesystem artifacts |
| Team/batch ingestion | Add bounded concurrency queue and resumable job manifests |
| High-volume automation | Add worker mode + centralized artifact store + provider throttling |

### Scaling Priorities

1. **First bottleneck:** provider rate limits/costs -> add retry/backoff and concurrency caps.
2. **Second bottleneck:** extractor volatility -> isolate source adapters and ship quick hotfixes.

## Anti-Patterns

### Anti-Pattern 1: “All logic in command handler”

**What people do:** Put source detection, extraction, transcription, and formatting directly in one command function.
**Why it's wrong:** Hard to test, hard to evolve, high regression risk during cutover.
**Do this instead:** Split into core pipeline modules with typed boundaries.

### Anti-Pattern 2: “Provider response == public schema”

**What people do:** Expose raw Deepgram/Groq response directly.
**Why it's wrong:** Breaks consumers whenever provider shape changes.
**Do this instead:** Normalize to internal canonical schema and version public outputs.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| yt-dlp | Subprocess command wrapper | Supports YouTube + Instagram extractors; keep version pinned/tested |
| ffmpeg | Subprocess command wrapper | Normalize to STT-friendly audio format |
| Deepgram | HTTP SDK adapter | Feature-rich path (model options, diarization/summaries) |
| Groq | HTTP SDK adapter | Fast transcription path with `verbose_json` support |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| CLI ↔ Core | Typed command DTOs | No CLI framework leakage into core |
| Core ↔ Infra | Interface contracts | Replaceable integrations for migration safety |
| Core ↔ Output | Canonical transcript model | Guarantees Markdown/JSON parity |

## Sources

- `.planning/PROJECT.md` (explicit v1 constraints and scope)
- Bun docs/release material (runtime/tooling direction)
- yt-dlp documentation and extractor behavior references
- Deepgram model/transcription docs
- Groq speech-to-text docs

---
*Architecture research for: agent-first media transcription CLI*
*Researched: 2026-03-02*
