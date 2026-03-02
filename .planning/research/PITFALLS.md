# Pitfalls Research

**Domain:** Public-media ingestion and transcription CLI (TS/Bun)
**Researched:** 2026-03-02
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Instagram volatility treated as deterministic

**What goes wrong:** Public Instagram URLs intermittently fail due platform changes or implicit auth gating.

**Why it happens:** Instagram extraction behavior changes frequently; toolchains assume stability.

**How to avoid:** Isolate Instagram adapter, add integration smoke tests, and enforce explicit `INSTAGRAM_AUTH_REQUIRED` error mapping.

**Warning signs:** Rising extraction failures on previously valid URLs, redirects to login pages, extractor-specific breakages.

**Phase to address:** Phase 2 (Source adapters + policy enforcement)

---

### Pitfall 2: Direct URL detection based only on file extension

**What goes wrong:** Non-media URLs with misleading suffixes or missing extension enter pipeline and fail late.

**Why it happens:** Teams validate only URL string suffix and skip content-type probing/head checks.

**How to avoid:** Validate by both URL pattern and HTTP content type/headers before download attempt.

**Warning signs:** Frequent late-stage `ffmpeg` decode failures or provider “unsupported format” errors.

**Phase to address:** Phase 2 (Source classification hardening)

---

### Pitfall 3: Markdown and JSON schema drift

**What goes wrong:** Different fields appear in Markdown vs JSON outputs over time; agents parse wrong assumptions.

**Why it happens:** Output renderers evolve independently without contract tests.

**How to avoid:** Generate both outputs from one canonical model and enforce golden fixture parity tests.

**Warning signs:** Bug reports where `--json` omits values present in Markdown frontmatter.

**Phase to address:** Phase 3 (Output contracts + schema tests)

---

### Pitfall 4: Unstable public error surface

**What goes wrong:** Similar failures return inconsistent messages/codes, breaking automated retries and fallback logic.

**Why it happens:** Exceptions bubble up directly from subprocesses/providers.

**How to avoid:** Central error taxonomy (`AUTH_REQUIRED`, `UNSUPPORTED_SOURCE`, `DOWNLOAD_FAILED`, `TRANSCRIBE_FAILED`) with strict mapping.

**Warning signs:** Scripts relying on message text matching instead of stable codes.

**Phase to address:** Phase 1 (Core contracts + CLI boundary)

---

### Pitfall 5: Hidden dependency assumptions (`yt-dlp`/`ffmpeg`)

**What goes wrong:** CLI passes local tests but fails in user environments due missing or broken binaries.

**Why it happens:** Setup checks are not explicit at startup.

**How to avoid:** Add doctor/preflight command and startup checks with actionable remediation text.

**Warning signs:** High support volume on install/runtime errors before actual transcription logic runs.

**Phase to address:** Phase 1 (Bootstrap + environment validation)

---

### Pitfall 6: Large media handling not bounded

**What goes wrong:** Long files or large remote assets cause timeouts, memory spikes, or excessive provider costs.

**Why it happens:** No chunking, concurrency limits, or timeout policies.

**How to avoid:** Bound file size/runtime, add chunking strategy, and support resumable processing.

**Warning signs:** OOM errors, high cloud bills, or frequent timeout exits on long-form media.

**Phase to address:** Phase 4 (Reliability and scaling hardening)

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Embed all pipeline logic in CLI handlers | Faster initial delivery | Refactor pain and fragile behavior | Only for throwaway prototype, not v1 |
| Pass provider responses straight to output | Less mapping code | Breaking contract on provider API changes | Never for agent-facing schema |
| Hardcode error strings | Quick implementation | Automation instability and parsing fragility | Never |
| Skip fixture-based output validation | Faster test writing | Silent schema drift | Never for `--json` contract |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| yt-dlp | Assuming extractor behavior is stable forever | Pin/test versions, isolate adapter, monitor failures |
| Instagram | Trying to silently bypass auth requirements | Return explicit `INSTAGRAM_AUTH_REQUIRED` with guidance |
| Deepgram/Groq | Treating provider-specific fields as guaranteed | Normalize to canonical schema and keep provider fields optional |
| ffmpeg | Assuming all inputs decode without normalization | Enforce normalization pipeline and detect codec incompatibility early |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| No concurrency limits | Provider 429/rate-limit spikes | Bounded worker pool + retry/backoff | Batch or multi-agent usage |
| Full-file memory buffering | Memory spikes on long media | Stream/chunk processing and temp-file discipline | Long podcasts/videos |
| Duplicate reprocessing | Wasted compute/cost | Checksum-based skip cache | Repeated ingestion workflows |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Logging raw API keys/errors verbosely | Credential exposure in logs | Redact secrets and sanitize stderr in logs |
| Accepting authenticated scraping in v1 | Compliance and account-risk exposure | Public-only policy enforcement with explicit failures |
| Unvalidated file paths for output | Path traversal/overwrite issues | Normalize + sandbox output paths |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Ambiguous failures (“something went wrong”) | Users/agents cannot recover | Stable code + short remediation hint |
| Non-deterministic summary style | Hard to compare/consume outputs | Fixed summary template (1 paragraph + 5 bullets) |
| Hidden default behaviors | Confusing automation behavior | Document defaults and provide explicit flags |

## "Looks Done But Isn't" Checklist

- [ ] **Instagram support:** Handles public URLs and explicit auth-required failures, not just happy path.
- [ ] **JSON mode:** Includes `schema_version` and complete metadata parity with Markdown.
- [ ] **Error handling:** Non-zero exits and stable code taxonomy validated by tests.
- [ ] **Binary prerequisites:** Clear doctor/preflight checks for `yt-dlp` and `ffmpeg`.
- [ ] **Output determinism:** Golden sample fixture remains stable across releases.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Extractor breakages | MEDIUM | Patch adapter logic, bump/pin yt-dlp version, re-run smoke suite |
| Schema drift shipped | HIGH | Revert output changes, regenerate fixtures, release patch with migration note |
| Error code regressions | MEDIUM | Add contract tests, map old-to-new where possible, patch quickly |
| Provider outage/rate limit | MEDIUM | Retry with backoff, switch provider if configured, surface explicit status |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Error taxonomy instability | Phase 1 | Contract tests for failure classes and exit codes |
| Source policy and direct URL misclassification | Phase 2 | URL matrix tests (supported/unsupported/auth-required) |
| Markdown/JSON drift | Phase 3 | Golden fixture parity tests in CI |
| Large media and concurrency failures | Phase 4 | Load-like integration tests with bounded concurrency |
| Instagram extractor volatility | Phase 5 (hardening) | Scheduled smoke tests on sample public URLs |

## Sources

- yt-dlp docs/issues (extractor support + auth-required failure behavior)
- Groq speech-to-text docs (size/format and transcription constraints)
- Deepgram model/docs (provider behavior and options)
- Existing codebase concerns in `.planning/codebase/CONCERNS.md`

---
*Pitfalls research for: agent-first media transcription CLI*
*Researched: 2026-03-02*
