---
phase: 01-bun-ts-foundation
plan: 02
subsystem: cli
tags: [help-ux, command-contract, error-taxonomy]
requires:
  - phase: 01-01
    provides: Bun/TS entrypoint and baseline contract modules
provides:
  - Locked top-level help IA (Usage -> Commands -> Global options -> Examples -> Notes)
  - Phase-aware deterministic placeholder errors for deferred command paths
  - Regression tests for help order and command identity
affects: [phase-03-instagram-public-intake, phase-04-transcription-providers, phase-05-output-contracts]
tech-stack:
  added: []
  patterns: [help-from-contract-constants, centralized-cli-error-formatting]
key-files:
  created:
    - src/errors/cli-errors.ts
    - test/cli/identity.test.ts
  modified:
    - src/cli/command-contract.ts
    - src/cli/build-cli.ts
    - src/cli/handlers.ts
    - test/cli/help.test.ts
key-decisions:
  - "Represent deferred command paths as first-class placeholders with explicit phase mapping and non-zero exits."
  - "Enforce help IA ordering through tests instead of relying on manual formatting checks."
patterns-established:
  - "Use formatCliError() for stable machine-readable error prefixes plus actionable bullets."
  - "Treat placeholder command routes as contract behavior, covered by identity regression tests."
requirements-completed: [CLI-01, MIGR-02]
duration: 1 min
completed: 2026-03-02
---

# Phase 1 Plan 2: Help and baseline routing Summary

**Locked help information architecture with deterministic placeholder command routing and regression-safe identity tests**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-02T16:54:35-03:00
- **Completed:** 2026-03-02T19:55:48Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Implemented the exact top-level help section order with coming-soon labeling and high-signal examples.
- Added centralized CLI error types and phase-aware placeholder routing for deferred commands.
- Added regression tests that lock help ordering, command identity, and deterministic non-zero placeholder behavior.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement locked help information architecture** - `f5fa3a6` (feat)
2. **Task 2: Enforce baseline command surface and deterministic placeholder behavior** - `03dbfad` (feat)
3. **Task 3: Add contract tests for help and command identity** - `de803af` (test)

## Files Created/Modified
- `src/cli/command-contract.ts` - Help sections, command rows, and examples as locked contract data.
- `src/cli/build-cli.ts` - Parser/dispatcher updated for deferred command routing and uniform error handling.
- `src/cli/handlers.ts` - Deterministic baseline and deferred-command handlers.
- `src/errors/cli-errors.ts` - Shared structured CLI error taxonomy + formatter.
- `test/cli/help.test.ts` - Section-order and coming-soon coverage checks.
- `test/cli/identity.test.ts` - Identity invariants and placeholder guidance checks.

## Decisions Made
- Deferred command verbs are intentionally surfaced in help but hard-fail with explicit phase guidance.
- Error output now uses stable `[CODE]` prefixes to support scripted checks in future phases.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ready for legacy compatibility boundary and Python-free runtime assertions in `01-03`.
- No blockers carried forward.

---
*Phase: 01-bun-ts-foundation*
*Completed: 2026-03-02*
