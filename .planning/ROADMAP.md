# Roadmap: pi-tube

## Overview

This roadmap delivers a full v1 cutover from Python to TypeScript + Bun while preserving `pi-tube` command identity and shipping a deterministic, agent-first transcription pipeline across YouTube, Instagram public URLs, direct media URLs, and local files.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [x] **Phase 1: Bun/TS Foundation** - Establish TypeScript + Bun CLI baseline and migrate core command surface.
- [ ] **Phase 2: Core Source Intake** - Implement YouTube, direct URL, and local-file ingestion with strict input policy.
- [ ] **Phase 3: Instagram Public Intake** - Add public-only Instagram ingestion with explicit auth-required behavior.
- [ ] **Phase 4: Transcription Providers** - Implement Deepgram/Groq provider pipeline with stable provider abstraction.
- [ ] **Phase 5: Output Contracts** - Deliver deterministic Markdown+JSON artifact contract for agent/human workflows.
- [ ] **Phase 6: Reliability & Release Gates** - Finalize config UX, error taxonomy, fixtures, and release-hardening.

## Phase Details

### Phase 1: Bun/TS Foundation
**Goal**: Deliver the primary TypeScript + Bun runtime path with baseline CLI command discoverability.
**Depends on**: Nothing (first phase)
**Requirements**: MIGR-01, MIGR-02, MIGR-03, CLI-01
**Success Criteria** (what must be TRUE):
  1. User can run `pi-tube` commands through Bun/TS entrypoint.
  2. User can invoke `pi-tube --help` and see structured command usage.
  3. User does not need Python runtime to execute v1 command path.
  4. Existing command identity remains `pi-tube`.
**Plans**: 4 plans

Plans:
- [x] 01-01: Bootstrap Bun + TypeScript project structure and command entrypoint
- [x] 01-02: Port base CLI command routing and shared flags/help UX
- [x] 01-03: Wire legacy compatibility shim and remove Python runtime dependency from main path
- [x] 01-04: Validate install/run flow and update top-level CLI usage docs

### Phase 2: Core Source Intake
**Goal**: Support deterministic ingestion for YouTube, direct media URLs, and local files.
**Depends on**: Phase 1
**Requirements**: SRC-01, SRC-04, SRC-05, SRC-06
**Success Criteria** (what must be TRUE):
  1. User can transcribe from YouTube URL using the new TS/Bun CLI.
  2. User can transcribe from supported direct media URLs.
  3. User can transcribe from supported local files.
  4. Non-direct URLs fail early with `UNSUPPORTED_URL_NOT_DIRECT_MEDIA`.
**Plans**: 4 plans

Plans:
- [x] 02-01: Build source resolver and URL/local-file classifier with policy checks
- [ ] 02-02: Implement yt-dlp extraction adapter for YouTube ingestion
- [ ] 02-03: Implement direct-media URL validation and local-file normalization path
- [ ] 02-04: Add integration tests for supported/unsupported core source matrix

### Phase 3: Instagram Public Intake
**Goal**: Add Instagram public post/reel/video support with explicit public-only policy enforcement.
**Depends on**: Phase 2
**Requirements**: SRC-02, SRC-03
**Success Criteria** (what must be TRUE):
  1. User can transcribe from supported Instagram public URLs.
  2. Auth-required Instagram cases return `INSTAGRAM_AUTH_REQUIRED`.
  3. CLI exits non-zero and provides remediation guidance for auth-required cases.
**Plans**: 3 plans

Plans:
- [ ] 03-01: Implement Instagram public URL adapter via extractor boundary
- [ ] 03-02: Add auth-required detection and explicit failure mapping
- [ ] 03-03: Add smoke tests for public success and auth-required failure paths

### Phase 4: Transcription Providers
**Goal**: Deliver provider abstraction with Deepgram and Groq implementations and mapped provider failures.
**Depends on**: Phase 3
**Requirements**: TRNS-01, TRNS-02, TRNS-03, TRNS-04
**Success Criteria** (what must be TRUE):
  1. User can choose Deepgram or Groq transcription provider.
  2. User can pass language preference and receive language metadata where available.
  3. Provider-layer failures map to stable public error classes.
  4. Provider switching does not change input/output command contract.
**Plans**: 4 plans

Plans:
- [ ] 04-01: Define provider interface and canonical transcription response contract
- [ ] 04-02: Implement Deepgram adapter with options + metadata mapping
- [ ] 04-03: Implement Groq adapter with options + metadata mapping
- [ ] 04-04: Add provider integration tests and failure mapping tests

### Phase 5: Output Contracts
**Goal**: Produce deterministic Markdown and JSON artifacts from one canonical model.
**Depends on**: Phase 4
**Requirements**: OUT-01, OUT-02, OUT-03, OUT-04, OUT-05, OUT-06, CLI-03, CLI-04
**Success Criteria** (what must be TRUE):
  1. User receives Markdown output with YAML frontmatter and fixed summary format.
  2. User can request deterministic JSON output with `schema_version`.
  3. Markdown and JSON carry equivalent transcription information.
  4. Agent-focused command usage (`--json`) is documented and provider status command works.
**Plans**: 4 plans

Plans:
- [ ] 05-01: Define canonical transcript schema and versioning strategy
- [ ] 05-02: Implement Markdown renderer (frontmatter + fixed summary + transcript sections)
- [ ] 05-03: Implement JSON renderer and `--json` command output path
- [ ] 05-04: Implement provider status command and agent-usage documentation examples

### Phase 6: Reliability & Release Gates
**Goal**: Finalize configuration UX, stable public error taxonomy, and regression-safety gates for release.
**Depends on**: Phase 5
**Requirements**: CLI-02, ERR-01, ERR-02, ERR-03, ERR-04
**Success Criteria** (what must be TRUE):
  1. User can configure provider credentials via env and CLI configuration flow.
  2. Failures return stable machine-readable error codes with correct non-zero exits.
  3. CLI outputs concise remediation guidance for common failure classes.
  4. Golden fixture and CI checks prevent output contract regressions.
**Plans**: 4 plans

Plans:
- [ ] 06-01: Implement config command flow and env precedence rules
- [ ] 06-02: Implement centralized error taxonomy and exit code policy
- [ ] 06-03: Add golden transcript fixtures and parity/contract tests
- [ ] 06-04: Add CI quality gates (lint/test/fixture verification) and release checklist

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Bun/TS Foundation | 4/4 | Complete | 2026-03-02 |
| 2. Core Source Intake | 1/4 | In Progress|  |
| 3. Instagram Public Intake | 0/3 | Not started | - |
| 4. Transcription Providers | 0/4 | Not started | - |
| 5. Output Contracts | 0/4 | Not started | - |
| 6. Reliability & Release Gates | 0/4 | Not started | - |
