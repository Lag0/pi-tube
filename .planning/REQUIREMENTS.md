# Requirements: pi-tube

**Defined:** 2026-03-02
**Core Value:** Turn public media inputs into trustworthy, structured, ready-to-use knowledge artifacts fast.

## v1 Requirements

### Runtime & Migration

- [x] **MIGR-01**: User can run `pi-tube` CLI on Bun + TypeScript as the primary runtime path.
- [x] **MIGR-02**: User can use the same command identity (`pi-tube`) after migration without renaming.
- [x] **MIGR-03**: User can install and execute v1 without requiring the legacy Python runtime.

### Source Ingestion

- [x] **SRC-01**: User can transcribe from a YouTube URL.
- [x] **SRC-02**: User can transcribe from an Instagram public post/reel/video URL.
- [x] **SRC-03**: User receives `INSTAGRAM_AUTH_REQUIRED` when an Instagram URL requires authentication.
- [x] **SRC-04**: User can transcribe from a direct media URL (`.mp4`, `.mov`, `.m4a`, `.mp3`, `.wav`, and supported equivalents).
- [x] **SRC-05**: User receives `UNSUPPORTED_URL_NOT_DIRECT_MEDIA` when a URL is not a direct downloadable media URL.
- [x] **SRC-06**: User can transcribe from a local file path for supported audio/video formats.

### Transcription Providers

- [ ] **TRNS-01**: User can select Deepgram as transcription provider.
- [ ] **TRNS-02**: User can select Groq as transcription provider.
- [x] **TRNS-03**: User can pass language preference and receive language metadata in output when available.
- [x] **TRNS-04**: User receives provider-specific failures mapped to stable public error codes.

### Output Contract

- [ ] **OUT-01**: User receives Markdown output with YAML frontmatter metadata.
- [ ] **OUT-02**: User receives summary at top in fixed format (1 paragraph with 2-4 sentences + 5 key-point bullets).
- [ ] **OUT-03**: User receives transcript section structured with timestamps when provider data is available.
- [ ] **OUT-04**: User can request JSON output via `--json`.
- [ ] **OUT-05**: JSON output includes `schema_version` and deterministic field names.
- [ ] **OUT-06**: Markdown and JSON outputs represent equivalent transcription data.

### CLI & Agent UX

- [x] **CLI-01**: User can discover commands/options via `--help` with examples for all supported input sources.
- [ ] **CLI-02**: User can configure provider API keys via env variables and CLI configuration flow.
- [ ] **CLI-03**: User can run agent-friendly workflows using documented `--json` command patterns.
- [ ] **CLI-04**: User can inspect provider readiness with a dedicated provider status command.

### Reliability & Errors

- [ ] **ERR-01**: User receives stable machine-readable error codes for unsupported source, auth required, download failure, and transcription failure.
- [ ] **ERR-02**: CLI exits with non-zero status on failures and zero on success.
- [ ] **ERR-03**: User receives concise remediation guidance for common failure classes.
- [ ] **ERR-04**: Project includes at least one golden output fixture used to detect schema/format regressions.

## v2 Requirements

### Source Expansion

- **SRC2-01**: User can ingest media from additional non-core platforms beyond YouTube/Instagram/direct/local.
- **SRC2-02**: User can use optional generic page extraction when explicitly enabled.

### Transcription Expansion

- **TRNS2-01**: User can use local/offline transcription fallback provider.
- **TRNS2-02**: User can use optional multi-provider fallback chain automatically.

### Workflow Enhancements

- **WF-01**: User can output Markdown and JSON simultaneously with one command (`--both`).
- **WF-02**: User can process batch input manifests with bounded concurrency and resume support.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Instagram authenticated/private scraping | Explicitly excluded for compliance and maintenance risk in v1 |
| Cookie/session-based extraction flows | Conflicts with public-only source policy |
| Instagram Stories and Live | Deferred beyond v1 scope |
| Generic HTML embedded player extraction | High breakage and low determinism for v1 |
| Repository/package rename away from `pi-tube` | Deferred to avoid migration friction |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MIGR-01 | Phase 1 | Complete |
| MIGR-02 | Phase 1 | Complete |
| MIGR-03 | Phase 1 | Complete |
| SRC-01 | Phase 2 | Complete |
| SRC-02 | Phase 3 | Complete |
| SRC-03 | Phase 3 | Complete |
| SRC-04 | Phase 2 | Complete |
| SRC-05 | Phase 2 | Complete |
| SRC-06 | Phase 2 | Complete |
| TRNS-01 | Phase 4 | Pending |
| TRNS-02 | Phase 4 | Pending |
| TRNS-03 | Phase 4 | Complete |
| TRNS-04 | Phase 4 | Complete |
| OUT-01 | Phase 5 | Pending |
| OUT-02 | Phase 5 | Pending |
| OUT-03 | Phase 5 | Pending |
| OUT-04 | Phase 5 | Pending |
| OUT-05 | Phase 5 | Pending |
| OUT-06 | Phase 5 | Pending |
| CLI-01 | Phase 1 | Complete |
| CLI-02 | Phase 6 | Pending |
| CLI-03 | Phase 5 | Pending |
| CLI-04 | Phase 5 | Pending |
| ERR-01 | Phase 6 | Pending |
| ERR-02 | Phase 6 | Pending |
| ERR-03 | Phase 6 | Pending |
| ERR-04 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-02*
*Last updated: 2026-03-02 after initial definition*
