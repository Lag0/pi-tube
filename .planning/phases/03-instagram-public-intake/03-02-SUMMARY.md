---
phase: 03-instagram-public-intake
plan: 02
subsystem: intake
tags: [instagram, errors, auth-required, cli]
requires:
  - phase: 03-instagram-public-intake
    provides: instagram adapter foundation and resolver routing
provides:
  - deterministic INSTAGRAM_AUTH_REQUIRED error mapping
  - stable Instagram error constructors for auth and non-auth failures
  - CLI smoke coverage for auth-required remediation messaging
affects: [phase-03-03, cli, error-taxonomy]
tech-stack:
  added: []
  patterns:
    - explicit auth-signature classification at extraction boundary
    - stable machine-readable error mapping for CLI output
key-files:
  created: []
  modified:
    - src/errors/cli-errors.ts
    - src/intake/tools/yt-dlp.ts
    - src/intake/adapters/instagram.ts
    - src/cli/handlers.ts
    - test/intake/instagram-adapter.test.ts
    - test/cli/intake-cli.test.ts
key-decisions:
  - "Auth-required Instagram cases are detected from curated yt-dlp stderr/stdout signatures and mapped to INSTAGRAM_AUTH_REQUIRED."
  - "Instagram non-auth extractor failures stay separated under INSTAGRAM_EXTRACT_FAILED to avoid misleading remediation."
patterns-established:
  - "Extractor error-classification logic distinguishes authentication gates from generic transport or parser failures."
requirements-completed: [SRC-03]
duration: 4min
completed: 2026-03-02
---

# Phase 3 Plan 02: Instagram Auth-Required Mapping Summary

**Instagram authentication-gated URLs now fail deterministically with `INSTAGRAM_AUTH_REQUIRED` and CLI remediation guidance, while non-auth failures remain explicitly separated.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-02T21:26:30Z
- **Completed:** 2026-03-02T21:30:11Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Added stable Instagram error constructors for URL validation, auth-required, and generic extraction failures.
- Implemented auth-required signature detection in yt-dlp boundary and mapped it to `INSTAGRAM_AUTH_REQUIRED`.
- Added CLI and adapter regression tests validating non-zero exit behavior and remediation guidance.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add stable Instagram auth-required and extraction-failure error constructors** - `8d8cb48` (feat)
2. **Task 2: Detect auth-required extractor failures and map to `INSTAGRAM_AUTH_REQUIRED`** - `4573094` (feat)
3. **Task 3: Add CLI-facing auth-required smoke coverage** - `99bef17` (test)

**Plan metadata:** pending

## Files Created/Modified
- `src/errors/cli-errors.ts` - Added Instagram-specific error helpers and guidance.
- `src/intake/tools/yt-dlp.ts` - Added auth-required signature detection and error mapping split.
- `src/intake/adapters/instagram.ts` - Switched invalid URL handling to stable helper.
- `src/cli/handlers.ts` - Added Instagram intake success output fields.
- `test/intake/instagram-adapter.test.ts` - Added auth-required and non-auth mapping regression tests.
- `test/cli/intake-cli.test.ts` - Added Instagram public success and auth-required CLI smoke tests.

## Decisions Made
- Auth-required detection is based on curated extractor message signatures and intentionally scoped for deterministic behavior.
- Generic extractor failure messages remain mapped to `INSTAGRAM_EXTRACT_FAILED` to avoid over-reporting auth issues.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 3 now has both SRC-02 and SRC-03 behavior available for smoke matrix validation.
- Remaining work is test matrix expansion and contract/help/docs alignment in Plan 03.

---
*Phase: 03-instagram-public-intake*
*Completed: 2026-03-02*
