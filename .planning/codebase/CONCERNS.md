# Codebase Concerns

**Analysis Date:** 2026-03-02

## Tech Debt

**Large orchestration in `pi_tube/cli.py`:**
- Issue: `_transcribe_with_provider()` centralizes multiple responsibilities (validation, input classification, download, conversion, transcription, output naming, cleanup)
- Why: Fast initial implementation in a single command module
- Impact: Harder to test in isolation and riskier to modify without regressions
- Fix approach: Extract orchestration steps into dedicated service functions/modules with unit-testable boundaries

**Config loading side effects in `pi_tube/config.py`:**
- Issue: Environment and config file loading runs at import time
- Why: Simplifies usage of `Config` class across modules
- Impact: Harder to reason about execution order and more difficult to control during tests
- Fix approach: Move loading into explicit initialization function called at CLI startup

## Known Bugs

**Potential startup latency and noisy UX on command invocation:**
- Symptoms: Commands may pause briefly on startup due to network update check in `main_callback()`
- Trigger: Any CLI command except `version` and `config` executes `check_latest_version()`
- Workaround: None in current implementation
- Root cause: Synchronous network request (`urllib.request.urlopen(..., timeout=2)`) on command startup

**Version comparison fragility for non-numeric SemVer forms:**
- Symptoms: Update check can fail silently if versions include non-integer segments (e.g., pre-release labels)
- Trigger: Parsing in `check_latest_version()` when `int()` conversion fails
- Workaround: Exception is swallowed, so update notice is skipped
- Root cause: Naive numeric split/compare logic in `pi_tube/utils.py`

## Security Considerations

**API key storage in plaintext config file:**
- Risk: `pi-tube config set` writes raw keys to `~/.config/pi-tube/config` without explicit permission hardening
- Current mitigation: Environment-variable override support and `.env` gitignore
- Recommendations: Enforce restrictive file permissions (e.g., `chmod 600`) and support OS keychain/secret manager backend

**Shell installer execution path:**
- Risk: Recommended install command pipes remote script directly to shell (`curl ... | bash` in `README.md`)
- Current mitigation: Script is visible in repository, but not integrity-pinned in command
- Recommendations: Offer checksum verification or package registry release path as default

## Performance Bottlenecks

**Repeated metadata/network calls for YouTube workflows:**
- Problem: `get_video_info()` is called in multiple places before download/transcription
- Measurement: Not instrumented
- Cause: Metadata is fetched separately for smart-skip logic and download naming
- Improvement path: Cache metadata within a single command execution and pass through call chain

**Synchronous update check on startup:**
- Problem: Blocks command startup on external request
- Measurement: timeout configured at 2s worst-case
- Cause: Callback executes request before main command logic
- Improvement path: make update check asynchronous, cached, or opt-in

## Fragile Areas

**Provider-specific response parsing in `pi_tube/transcribe/deepgram.py`:**
- Why fragile: Relies on nested response shape (`results.channels[0].alternatives[0]`, optional paragraph/summary fields)
- Common failures: SDK schema changes can break extraction paths
- Safe modification: Guard each nested access and add contract tests with fixture responses
- Test coverage: No automated tests detected

**Filename normalization consistency across modules:**
- Why fragile: Different sanitization logic in downloader (`re.sub` for invalid filesystem chars) and output naming (`slugify`)
- Common failures: Edge-case titles can produce unexpected naming/skipping behavior
- Safe modification: Centralize naming in one utility used by both downloader and transcript writer
- Test coverage: No automated tests detected

## Scaling Limits

**Cloud API throughput and cost scaling:**
- Current capacity: Bound to third-party API quotas/rate limits (Deepgram/Groq)
- Limit: Provider 429s or budget constraints under high volume
- Symptoms at limit: Transcription failures with rate-limit errors
- Scaling path: Add retry/backoff policy, queueing, and provider failover strategy

## Dependencies at Risk

**Hard dependency on external service availability:**
- Risk: Deepgram/Groq outages or API changes immediately affect core functionality
- Impact: Primary value path (transcription) fails
- Migration plan: Keep provider abstraction strict and add optional local/offline provider implementation

**`yt-dlp` behavioral changes:**
- Risk: Frequent upstream platform adjustments can break download behavior
- Impact: Ingestion from YouTube fails even if transcription logic is healthy
- Migration plan: Add smoke tests and pinned compatibility checks for common URL formats

## Missing Critical Features

**No automated test suite:**
- Problem: No regression safety net for download/transcribe/config flows
- Current workaround: Manual command testing
- Blocks: Safe refactoring and faster iteration
- Implementation complexity: Medium

**No CI pipeline:**
- Problem: Quality gates are not executed on changes
- Current workaround: Manual local verification
- Blocks: Reliable collaboration and release confidence
- Implementation complexity: Low to medium

## Test Coverage Gaps

**CLI orchestration (`pi_tube/cli.py`):**
- What's not tested: Branching behavior for YouTube vs local files and error paths
- Risk: Small edits can break major user workflows
- Priority: High
- Difficulty to test: Medium (requires mocking network and filesystem interactions)

**External integration contracts (`pi_tube/transcribe/*.py`, `pi_tube/downloader.py`):**
- What's not tested: SDK response parsing and download behavior assumptions
- Risk: Upstream changes cause runtime failures without early detection
- Priority: High
- Difficulty to test: Medium to high (fixtures/mocks required)

---

*Concerns audit: 2026-03-02*
*Update as issues are fixed or new ones discovered*
