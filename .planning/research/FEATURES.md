# Feature Research

**Domain:** Agent-first media ingestion + transcription CLI
**Researched:** 2026-03-02
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| YouTube URL ingestion | Core source for long-form knowledge extraction | MEDIUM | Use yt-dlp extractor path |
| Direct media URL ingestion | Needed for predictable automation pipelines | LOW | Only accept direct media links or fail explicitly |
| Local file ingestion | Required for manual fallback and offline handoff | LOW | Share pipeline with direct URL path |
| Instagram public post/reel/video ingestion | Explicitly required product goal | HIGH | Public-only, no cookies/login |
| Structured transcript with timestamps | Essential for knowledge indexing and feature development | MEDIUM | Preserve segment/word times when provider returns them |
| Deterministic summary at top | Needed for fast human/agent triage | LOW | Fixed format: 1 paragraph + 5 bullets |
| Machine-readable error codes | Required for robust agent orchestration | MEDIUM | Non-zero exits + stable code taxonomy |
| JSON output mode | Agent compatibility expectation | LOW | `--json` deterministic schema |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Markdown + JSON parity contract | Same data available in both human and machine formats | MEDIUM | Enforce with fixture/golden tests |
| Skill-specific “agent usage” docs | Reduces prompt/tooling friction for autonomous runs | LOW | Include explicit command recipes and failure handling |
| Source policy transparency (public-only Instagram) | Clear operational boundaries reduce unexpected failures | LOW | Publish explicit policy and error remediation |
| Checksum/dedup artifact behavior | Avoids reprocessing same media repeatedly | MEDIUM | High ROI for batch usage |
| Batch-friendly command ergonomics | Enables ingestion at scale for KB workflows | MEDIUM | Streamable stdout + predictable files |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Generic HTML player scraping | “Any URL should work” expectation | Extremely brittle across websites; anti-bot churn | Keep v1 strict: direct media links + explicit supported sources |
| Authenticated Instagram scraping | Desire to unlock private/restricted content | High legal, maintenance, and credential-handling risk | Public-only ingestion + explicit auth-required failure |
| Too many source connectors in v1 | Perceived completeness | Slows delivery and hurts reliability | Stabilize 4-source core first (YouTube, Instagram public, direct, local) |
| Local Whisper fallback in v1 | Reduce cloud dependence | Ops complexity and hardware variability during cutover | Keep cloud-first in v1; evaluate local fallback in v2 |

## Feature Dependencies

```
Source adapters (YouTube/Instagram/direct/local)
    └──requires──> downloader + media normalization (yt-dlp + ffmpeg)
                       └──requires──> transcription providers (Deepgram/Groq)
                                           └──requires──> output renderers (Markdown/JSON)

Error codes + schema contracts
    └──requires──> shared domain types + validation layer

Skill documentation
    └──enhances──> CLI usability for agents
```

### Dependency Notes

- **Source adapters require downloader/normalizer:** extraction quality depends on robust media acquisition and audio normalization.
- **Transcription depends on stable provider abstraction:** allows cloud provider swap without changing CLI contract.
- **Schema contract depends on typed validation:** prevents drift between Markdown frontmatter and JSON outputs.
- **Skill docs enhance all capabilities:** agents need explicit recipes and failure semantics.

## MVP Definition

### Launch With (v1)

- [ ] YouTube ingestion + transcription path — required core utility
- [ ] Instagram public post/reel/video ingestion (public-only) — explicit user requirement
- [ ] Direct media URL + local file ingestion — deterministic non-platform path
- [ ] Markdown frontmatter schema + optional `--json` schema parity — agent/human dual mode
- [ ] Fixed summary format and timestamped transcript sections — predictable artifact structure
- [ ] Stable error code taxonomy + non-zero exits — automation safety
- [ ] TypeScript + Bun full cutover while keeping `pi-tube` command identity — core migration goal

### Add After Validation (v1.x)

- [ ] `--both` output mode (`.md` + `.json`) — convenience enhancement
- [ ] Checksum-based skip/dedup cache — performance/cost optimization
- [ ] Batch input list processing with bounded concurrency — throughput improvements

### Future Consideration (v2+)

- [ ] Local/offline transcription provider fallback
- [ ] Additional platform extractors beyond current core sources
- [ ] Optional semantic post-processing (topics/entity extraction)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| TS+Bun cutover with CLI parity | HIGH | HIGH | P1 |
| YouTube/direct/local ingestion | HIGH | MEDIUM | P1 |
| Instagram public ingestion + auth-required signaling | HIGH | HIGH | P1 |
| Schema-stable Markdown + JSON outputs | HIGH | MEDIUM | P1 |
| Error code standardization | HIGH | MEDIUM | P1 |
| `--both` output convenience | MEDIUM | LOW | P2 |
| Dedup/checksum skip | MEDIUM | MEDIUM | P2 |
| Local Whisper fallback | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Firecrawl CLI | Tavily CLI | Our Approach |
|---------|---------------|------------|--------------|
| Agent-friendly CLI semantics | Strong command ergonomics and structured output modes | Strong command ergonomics and JSON support | Mirror this discipline for media ingestion/transcription |
| Multi-operation pipeline | Search/scrape/map/crawl commands | Search/extract/crawl/research commands | Source ingestion + transcription + structured artifact commands |
| Deterministic machine output | JSON-friendly modes and file output conventions | JSON/pretty options and doctor checks | `--json` + versioned schema + golden samples |
| Domain specialization | Web extraction domain | Web research domain | Media-to-knowledge extraction domain |

## Sources

- Firecrawl CLI README (command surface and output patterns)
- Tavily CLI README (agent-first CLI patterns and research workflow structure)
- Project context in `.planning/PROJECT.md` (v1 scope decisions)

---
*Feature research for: agent-first media transcription CLI*
*Researched: 2026-03-02*
