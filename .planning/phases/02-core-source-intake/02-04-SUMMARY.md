---
phase: 02-core-source-intake
plan: 04
subsystem: cli
tags: [cli, intake-matrix, integration-tests]
requires:
  - phase: 02-02
    provides: YouTube adapter + yt-dlp boundary
  - phase: 02-03
    provides: direct/local adapter validation and deterministic policy gates
provides:
  - Baseline CLI flow integrated with resolver-backed intake for supported source classes
  - Intake matrix and CLI integration regression suites for source-class behavior
  - Help/contract messaging aligned with active Phase 2 intake scope
affects: [phase-03-instagram-intake, phase-04-transcription-providers, release-readiness]
tech-stack:
  added: []
  patterns: [cli-to-resolver-boundary, deterministic-intake-output-markers]
key-files:
  created:
    - test/intake/intake-matrix.test.ts
    - test/cli/intake-cli.test.ts
  modified:
    - src/cli/handlers.ts
    - src/cli/build-cli.ts
    - src/cli/command-contract.ts
    - src/intake/tools/yt-dlp.ts
    - test/cli/help.test.ts
key-decisions:
  - "CLI baseline success output uses explicit intake markers (`[INTAKE_RESOLVED] kind=...`) to keep behavior testable and machine-readable."
  - "Provider execution remains deferred to Phase 4 even when source intake succeeds in Phase 2."
patterns-established:
  - "Baseline CLI path always resolves source intake before any provider-layer behavior."
  - "Integration suites assert exit code + deterministic output markers for each source class."
requirements-completed: [SRC-01, SRC-04, SRC-05, SRC-06]
duration: 2 min
completed: 2026-03-02
---

# Phase 2 Plan 4: CLI intake integration and matrix coverage Summary

**Baseline `pi-tube <input>` now executes real Phase 2 intake classification for YouTube, direct URLs, local files, and deterministic unsupported URL failures**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-02T20:27:00Z
- **Completed:** 2026-03-02T20:29:05Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Integrated resolver-backed intake flow into baseline CLI path with deterministic success/error handling.
- Added resolver matrix and CLI integration tests for supported and unsupported source classes.
- Updated help/contract text to reflect active Phase 2 intake while preserving deferred provider scope.

## Task Commits

Each task was committed atomically:

1. **Task 1: Integrate resolver into baseline CLI input handler** - `f982d11` (feat)
2. **Task 2: Add source matrix integration tests** - `3674bfb` (test)
3. **Task 3: Finalize CLI contract text for Phase 2 behavior** - `c1804e6` (docs)

## Files Created/Modified
- `src/cli/handlers.ts` - Baseline handler now resolves sources and returns deterministic intake metadata.
- `src/cli/build-cli.ts` - CLI execution path now prints intake markers on success and preserves error mapping.
- `src/cli/command-contract.ts` - Help contract updated to reflect active intake + deferred provider behavior.
- `src/intake/tools/yt-dlp.ts` - Added deterministic test override hooks for stable YouTube CLI integration tests.
- `test/intake/intake-matrix.test.ts` - Source-matrix regression tests for YouTube/direct/local/unsupported inputs.
- `test/cli/intake-cli.test.ts` - End-to-end CLI intake matrix tests validating exit codes and output markers.
- `test/cli/help.test.ts` - Help contract assertions aligned with Phase 2 wording.

## Decisions Made
- Standardized successful intake output around machine-readable markers rather than free-form text.
- Kept command-level verbs (`youtube`, `instagram`) deferred while baseline input path owns active source intake.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added deterministic yt-dlp test overrides for CLI integration stability**
- **Found during:** Task 2 (source matrix + CLI integration tests)
- **Issue:** Full CLI YouTube integration tests depended on local yt-dlp installation and would be flaky/non-portable.
- **Fix:** Added opt-in environment-based yt-dlp override hooks for deterministic success/failure simulation in tests.
- **Files modified:** `src/intake/tools/yt-dlp.ts`
- **Verification:** `bun test test/cli/intake-cli.test.ts`
- **Committed in:** `62f2644` (part of plan execution)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Improved test determinism without changing default production intake behavior.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 2 source intake matrix is active, deterministic, and integration-tested through CLI entrypoint.
- Ready for Phase 2 verification and transition into Phase 3 Instagram public intake planning.

---
*Phase: 02-core-source-intake*
*Completed: 2026-03-02*
