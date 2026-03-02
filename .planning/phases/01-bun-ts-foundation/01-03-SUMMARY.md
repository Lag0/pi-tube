---
phase: 01-bun-ts-foundation
plan: 03
subsystem: cli
tags: [legacy-compatibility, migration, runtime-cutover]
requires:
  - phase: 01-02
    provides: locked help contract and deterministic placeholder/error behavior
provides:
  - Dedicated legacy compatibility boundary with migration guidance
  - Bun-first runtime/docs positioning with no Python default-path dependency
  - Regression guard proving primary path remains Python-free
affects: [phase-04-transcription-providers, phase-06-reliability-release-gates]
tech-stack:
  added: []
  patterns: [legacy-guidance-boundary, no-python-regression-testing]
key-files:
  created:
    - src/legacy/compatibility.ts
    - test/cli/no-python-runtime.test.ts
  modified:
    - src/cli/build-cli.ts
    - src/cli/handlers.ts
    - package.json
    - src/index.ts
    - README.md
key-decisions:
  - "Legacy verbs are handled in a dedicated module and always return deterministic migration guidance with non-zero exit codes."
  - "Repository docs now define Bun/TS as the only default runtime path for v1 execution."
patterns-established:
  - "Compatibility logic is isolated in src/legacy/compatibility.ts rather than mixed into baseline handlers."
  - "Runtime migration claims are enforced by integration tests, not documentation alone."
requirements-completed: [MIGR-03, MIGR-01]
duration: 1 min
completed: 2026-03-02
---

# Phase 1 Plan 3: Legacy cutover Summary

**Legacy-command compatibility boundary plus Python-free Bun runtime cutover verified by dedicated regression tests**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-02T16:57:26-03:00
- **Completed:** 2026-03-02T19:58:30Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Added a dedicated legacy compatibility module that maps historical verbs to deterministic migration guidance.
- Updated package/runtime/docs to make Bun + TypeScript explicitly authoritative for default CLI execution.
- Added a no-Python regression test that fails if default runtime behavior drifts back to Python-oriented pathways.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add legacy compatibility boundary and guidance** - `ee7598c` (feat)
2. **Task 2: Make Bun/TS the authoritative default runtime path** - `537fcec` (feat)
3. **Task 3: Add migration guard test for no-Python primary path** - `e8acda1` (test)

## Files Created/Modified
- `src/legacy/compatibility.ts` - Isolated legacy command detection and migration guidance.
- `src/cli/build-cli.ts` - Legacy-compatibility route integrated before deferred/baseline handling.
- `src/cli/handlers.ts` - Deferred command scope narrowed to future non-legacy verbs.
- `package.json` - Bun engine/package manager metadata and Bun-first scripts.
- `README.md` - Bun-first command path documentation with explicit migration notes.
- `test/cli/no-python-runtime.test.ts` - Runtime guard against Python fallback regressions.

## Decisions Made
- Legacy invocation support is guidance-only in v1 and intentionally does not proxy to old Python command surfaces.
- Runtime migration success is treated as a testable invariant rather than a documentation-only claim.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ready for install-flow contract validation and final Phase 1 documentation/install alignment in `01-04`.
- No blockers carried forward.

---
*Phase: 01-bun-ts-foundation*
*Completed: 2026-03-02*
