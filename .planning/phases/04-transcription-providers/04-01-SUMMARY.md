---
phase: 04-transcription-providers
plan: 01
subsystem: transcription
tags: [providers, deepgram, groq, service, contracts]
requires:
  - phase: 03-instagram-public-intake
    provides: deterministic baseline intake result from `resolveSource`
provides:
  - canonical transcription request/result contracts
  - provider interface and registry lookup surface
  - service-level provider selection precedence and handler delegation
affects: [phase-04-02, phase-04-03, phase-04-04, cli, transcription]
tech-stack:
  added: []
  patterns: [contract-first provider abstraction, service-level provider selection]
key-files:
  created:
    - src/transcription/types.ts
    - src/transcription/providers/provider.ts
    - src/transcription/providers/index.ts
    - src/transcription/service.ts
    - test/transcription/provider-contract.test.ts
  modified:
    - src/cli/handlers.ts
key-decisions:
  - "Provider selection precedence is CLI option first, then PI_TUBE_TRANSCRIPTION_PROVIDER, then default deepgram."
  - "Language preference is normalized once in service boundary and forwarded via canonical request shape."
patterns-established:
  - "CLI handler delegates transcription execution to service instead of provider-specific logic."
  - "Provider registry and interface isolate provider adapters from CLI/integration layers."
requirements-completed: [TRNS-03, TRNS-04]
duration: 9 min
completed: 2026-03-02
---

# Phase 04 Plan 01: Canonical contract and service boundary Summary

**Canonical provider contracts and deterministic service selection now drive baseline handler transcription execution.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-02T21:36:30Z
- **Completed:** 2026-03-02T21:45:45Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Added provider-agnostic transcription request/result types and provider interface.
- Introduced service-level provider selection with deterministic precedence and stable error codes for invalid/unavailable providers.
- Added regression tests that lock provider selection precedence, language normalization, and canonical result shape.

## Task Commits

1. **Task 1: Define canonical transcription request/result contracts and provider interface** - `a99bc3d` (feat)
2. **Task 2: Implement transcription service skeleton with provider selection and stable result envelope** - `111bae9` (feat)
3. **Task 3: Add contract regression tests for provider-agnostic shape and selection precedence** - `c511dde` (test)

**Plan metadata:** pending docs commit

## Files Created/Modified
- `src/transcription/types.ts` - Canonical provider-agnostic request/result and execution types.
- `src/transcription/providers/provider.ts` - Provider interface contract.
- `src/transcription/providers/index.ts` - Registry surface for adapter registration and lookup.
- `src/transcription/service.ts` - Provider selection and transcription execution boundary.
- `src/cli/handlers.ts` - Baseline handler delegation to transcription service and output mapping.
- `test/transcription/provider-contract.test.ts` - Contract regression coverage for service behavior.

## Decisions Made
- Service chooses provider using CLI input first, then environment fallback, then a deterministic default.
- Result envelope keeps `requestedLanguage` and `detectedLanguage` in canonical fields independent of provider implementation.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ready for adapter implementation in plans 04-02 and 04-03 using established provider interface and service contract.
- No blockers.

---
*Phase: 04-transcription-providers*
*Completed: 2026-03-02*
