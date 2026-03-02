---
phase: 03-instagram-public-intake
plan: 01
subsystem: intake
tags: [instagram, yt-dlp, resolver, policy]
requires:
  - phase: 02-core-source-intake
    provides: source classification and adapter boundaries
provides:
  - Instagram public URL classification in intake policy
  - Instagram adapter wired into source resolver
  - Deterministic Instagram adapter regression tests
affects: [phase-03-02, phase-03-03, intake, cli]
tech-stack:
  added: []
  patterns:
    - source-specific adapter boundaries with shared resolver contract
    - URL policy gating before extractor invocation
key-files:
  created:
    - src/intake/adapters/instagram.ts
    - test/intake/instagram-adapter.test.ts
  modified:
    - src/intake/types.ts
    - src/intake/policy.ts
    - src/intake/resolver.ts
    - src/intake/tools/yt-dlp.ts
    - test/intake/source-resolver.test.ts
key-decisions:
  - "Instagram public URL support is constrained to /p/, /reel/, and /tv/ routes on instagram hosts."
  - "Instagram extraction reuses yt-dlp tooling with a dedicated adapter entrypoint for later error-mapping expansion."
patterns-established:
  - "Instagram intake follows the existing resolver -> adapter -> tool architecture used by YouTube."
requirements-completed: [SRC-02]
duration: 8min
completed: 2026-03-02
---

# Phase 3 Plan 01: Instagram Public Intake Foundation Summary

**Instagram public URL intake now resolves through a dedicated adapter boundary backed by yt-dlp tooling and deterministic policy classification.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-02T21:19:00Z
- **Completed:** 2026-03-02T21:26:55Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Extended intake contracts and classifier logic to recognize Instagram public URL shapes.
- Implemented `resolveInstagramSource` and a dedicated `resolveInstagramWithYtDlp` extractor path.
- Added regression tests covering Instagram URL validation and successful extraction mapping.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend intake contracts and policy for Instagram public URL classification** - `56807c0` (feat)
2. **Task 2: Implement Instagram adapter over extractor boundary** - `800ab91` (feat)
3. **Task 3: Add Instagram adapter success-path regression tests** - `d04da3f` (test)

**Plan metadata:** pending

## Files Created/Modified
- `src/intake/types.ts` - Added `instagram` source kind to contract types.
- `src/intake/policy.ts` - Added Instagram host/path policy checks and classifier integration.
- `src/intake/resolver.ts` - Routed `instagram` classification to adapter dependency boundary.
- `src/intake/adapters/instagram.ts` - Implemented Instagram public URL adapter contract.
- `src/intake/tools/yt-dlp.ts` - Added Instagram-specific extraction helper.
- `test/intake/source-resolver.test.ts` - Added resolver coverage for Instagram classification.
- `test/intake/instagram-adapter.test.ts` - Added adapter/tooling success and invalid-shape tests.

## Decisions Made
- Instagram public URL support intentionally accepts only `instagram.com` hosts with `/p/`, `/reel/`, and `/tv/` paths for deterministic scope.
- Instagram extraction uses the existing yt-dlp boundary model to avoid adding a second extraction stack.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Foundation is ready for Phase 3 Plan 02 auth-required detection and error mapping.
- CLI-level auth-required behavior and help/README alignment remain for subsequent plans.

---
*Phase: 03-instagram-public-intake*
*Completed: 2026-03-02*
