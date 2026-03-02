---
phase: 06-reliability-release-gates
plan: 02
subsystem: errors
tags: [error-taxonomy, exit-codes, cli-contract, regression-tests]
requires:
  - phase: 06-01
    provides: deterministic config command surface and precedence integration
provides:
  - canonical error catalog for stable public CLI codes
  - deterministic known-error formatting and non-zero exit guarantees
  - integration regression coverage for intake/transcription failure taxonomy
affects: [fixtures, ci-gates, release-checklist]
tech-stack:
  added: []
  patterns: [catalog-backed-error-contract, deterministic-error-format]
key-files:
  created: [src/errors/catalog.ts, test/errors/error-taxonomy.test.ts, test/cli/error-exit-codes.test.ts]
  modified: [src/errors/cli-errors.ts, test/cli/intake-cli.test.ts, test/cli/transcription-cli.test.ts]
key-decisions:
  - "All public error codes must exist in ERROR_CATALOG and carry deterministic metadata."
  - "Known error guidance lines use a stable `guidance:` prefix for parser-safe formatting."
patterns-established:
  - "Catalog drift is blocked by tests that compare source code literals with catalog keys."
  - "CLI integration suites assert non-zero exits for known failure classes and code-specific markers."
requirements-completed: [ERR-01, ERR-02, ERR-03]
duration: 27min
completed: 2026-03-03
---

# Phase 6: Reliability & Release Gates Summary

**Centralized CLI error taxonomy with deterministic exit behavior and integration coverage across intake and transcription failure paths.**

## Performance

- **Duration:** 27 min
- **Started:** 2026-03-03T00:00:00Z
- **Completed:** 2026-03-03T00:27:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Added `src/errors/catalog.ts` as the canonical metadata source for all public error codes.
- Hardened `CliError` construction/formatting to enforce deterministic non-zero exits and concise guidance line structure.
- Expanded runtime regression suites to cover additional intake/transcription failure mappings.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add canonical error-code catalog and align constructors** - `e117a87` (feat)
2. **Task 2: Enforce deterministic exit policy and guidance formatting** - `16dc1e8` (fix)
3. **Task 3: Add integration regressions for taxonomy coverage in runtime flows** - `b27e11d` (test)

**Plan metadata:** `pending` (docs: complete plan)

## Files Created/Modified
- `src/errors/catalog.ts` - Canonical registry for known public error codes, exits, and default guidance.
- `src/errors/cli-errors.ts` - Catalog-aware error construction and deterministic formatter output.
- `test/errors/error-taxonomy.test.ts` - Catalog drift tests against literal code declarations.
- `test/cli/error-exit-codes.test.ts` - Exit policy and unexpected-failure differentiation checks.
- `test/cli/intake-cli.test.ts` - Runtime intake failure mappings (`YTDLP_NOT_FOUND`, `YOUTUBE_EXTRACT_FAILED`, `INSTAGRAM_EXTRACT_FAILED`).
- `test/cli/transcription-cli.test.ts` - Provider unavailable/invalid-response error coverage.

## Decisions Made
- Error-code metadata is now centralized in one source (`ERROR_CATALOG`) and reused by constructor defaults.
- Formatting contract for known errors uses one marker line plus normalized `guidance:` lines to keep machine parsing stable.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Golden fixture work can rely on a locked error/exit contract baseline.
- CI gate phase can include `error-taxonomy` and `error-exit-codes` suites as deterministic release checks.

---
*Phase: 06-reliability-release-gates*
*Completed: 2026-03-03*
