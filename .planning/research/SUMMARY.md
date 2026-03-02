# Project Research Summary

**Project:** pi-tube
**Domain:** Agent-first media ingestion and transcription CLI
**Researched:** 2026-03-02
**Confidence:** HIGH

## Executive Summary

The research supports a clean v1 direction: perform a full runtime cutover to TypeScript + Bun while preserving the `pi-tube` command identity and enforcing deterministic agent contracts. The recommended architecture keeps volatile integrations (`yt-dlp`, Instagram extraction behavior, cloud STT APIs) behind adapters so core contracts remain stable.

For source coverage, the right v1 scope is YouTube + Instagram public + direct media URL + local file. This satisfies core user goals while avoiding the high-volatility trap of generic HTML player extraction and authenticated scraping. Reliability depends on strict source policy checks and explicit error codes for auth-required and unsupported input paths.

The biggest execution risk is contract drift: Markdown/JSON mismatches and unstable errors break agent workflows quickly. A canonical internal transcript model, schema-versioned outputs, and golden fixtures are essential to ship a trustworthy v1.

## Key Findings

### Recommended Stack

A Bun + TypeScript stack is appropriate for this CLI domain and aligns with the requested cutover. Pairing `commander` (CLI surface), `zod` (contract validation), and `execa` (safe subprocesses) provides strong ergonomics for a media pipeline. Keep yt-dlp + ffmpeg as infrastructure binaries; they remain the practical extraction/normalization foundation.

**Core technologies:**
- **Bun 1.3.10:** runtime + package tooling — fast CLI startup and TS-native workflow
- **TypeScript 5.9.3:** typed contracts — stable output/error interfaces for agents
- **yt-dlp 2026.2.21:** extraction backbone — robust source support (including Instagram extractor family)
- **ffmpeg:** media normalization — required preprocessing for reliable STT

### Expected Features

**Must have (table stakes):**
- YouTube/direct/local/Instagram-public ingestion with policy enforcement
- Deterministic Markdown artifact with YAML frontmatter
- Optional deterministic `--json` with `schema_version`
- Fixed summary format and timestamped transcript sections
- Stable error code taxonomy with non-zero exit semantics

**Should have (competitive):**
- Markdown/JSON parity guarantees (single canonical model)
- Skill docs optimized for agent execution patterns
- Golden output fixtures for contract stability

**Defer (v2+):**
- Generic HTML page extraction
- Authenticated scraping flows
- Local/offline STT fallback

### Architecture Approach

Use a layered CLI architecture: command layer -> core pipeline (source resolve, extract/normalize, transcribe, render) -> infrastructure adapters. Keep provider and extractor specifics out of core contracts. Generate Markdown and JSON from one canonical transcript model to prevent schema drift.

**Major components:**
1. **Source Resolver** — classify and enforce v1 source policy.
2. **Extractor/Normalizer Pipeline** — acquire media and convert audio reliably.
3. **Provider Adapter Layer** — Deepgram and Groq behind a stable interface.
4. **Output Contract Layer** — schema-versioned Markdown/JSON renderers + error mapper.

### Critical Pitfalls

1. **Instagram volatility** — isolate adapter and return explicit `INSTAGRAM_AUTH_REQUIRED`.
2. **Direct URL misclassification** — validate content type, not only extension.
3. **Markdown/JSON drift** — render both from one canonical object + fixture tests.
4. **Unstable public errors** — enforce strict error taxonomy at CLI boundary.
5. **Hidden binary prerequisites** — add doctor/preflight checks for yt-dlp/ffmpeg.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: TypeScript/Bun Foundation
**Rationale:** Migration baseline must be stable before feature parity expansion.
**Delivers:** New TS/Bun CLI skeleton, config handling, core error taxonomy.
**Addresses:** Runtime cutover and contract scaffolding.
**Avoids:** Large-handler anti-pattern and unstable error surface.

### Phase 2: Source Ingestion Layer
**Rationale:** Source policy controls product scope and reliability risk early.
**Delivers:** YouTube + direct URL + local file + Instagram public adapters.
**Uses:** yt-dlp/ffmpeg integration wrappers.
**Implements:** Public-only policy and explicit auth-required/unsupported errors.

### Phase 3: Transcription + Output Contracts
**Rationale:** Artifacts are the core product output for agents.
**Delivers:** Deepgram/Groq adapters, canonical transcript model, Markdown+JSON parity, fixed summary format.
**Uses:** zod schemas and schema_versioning.

### Phase 4: Reliability + Tests + Fixtures
**Rationale:** Agent workflows need deterministic behavior under failure.
**Delivers:** Golden samples, contract tests, integration matrix, bounded retries/timeouts.
**Implements:** Preflight/doctor checks and CI gates.

### Phase 5: Skill Packaging + Agent UX
**Rationale:** Final value requires consumable skill instructions and ergonomic usage.
**Delivers:** Skill docs, explicit `--json` usage examples, troubleshooting/error-code guide.

### Phase Ordering Rationale

- Foundation first prevents migration churn during feature work.
- Source policy precedes provider/output logic because it determines valid input contracts.
- Output contracts precede hardening so tests can lock behavior before optimization.
- Reliability/testing precedes skill polish to avoid documenting unstable behavior.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** Instagram extraction behavior and breakage mitigation strategy.
- **Phase 3:** Provider response normalization edge cases (timestamps/metadata parity).

Phases with standard patterns (skip heavy research-phase):
- **Phase 1:** TS/Bun CLI scaffolding.
- **Phase 5:** Skill documentation and command usage guides.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Version and tooling baseline verified via registries/docs |
| Features | HIGH | Directly aligned with explicit product scope decisions |
| Architecture | HIGH | Standard adapter-based CLI architecture fits volatility profile |
| Pitfalls | HIGH | Risks match known extractor/provider and contract-failure patterns |

**Overall confidence:** HIGH

### Gaps to Address

- Instagram extractor stability may fluctuate; keep a fast patch/release path.
- Confirm provider-specific metadata fidelity for strict Markdown/JSON parity tests.

## Sources

### Primary (HIGH confidence)
- Bun docs/release pages (`bun.sh`) — runtime/tooling baseline
- npm registry package metadata (`npm view`) — current TypeScript/library versions
- PyPI index for yt-dlp — current extractor release baseline
- Groq docs (speech-to-text) — model and response constraints
- Deepgram docs (model options/transcription) — provider capability surface

### Secondary (MEDIUM confidence)
- yt-dlp README and extractor listing behavior
- Firecrawl CLI and Tavily CLI READMEs for agent-centric CLI patterns

### Tertiary (LOW confidence)
- Community issue reports on Instagram auth-required edge cases

---
*Research completed: 2026-03-02*
*Ready for roadmap: yes*
