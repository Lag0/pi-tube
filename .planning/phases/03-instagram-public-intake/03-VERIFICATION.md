---
phase: 03-instagram-public-intake
verified: "2026-03-02T21:32:19Z"
status: passed
score: 3/3 must-haves verified
---

# Phase 03: instagram-public-intake — Verification

## Observable Truths
| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can transcribe from supported Instagram public post/reel/video URLs | verified | `test/cli/intake-cli.test.ts` Instagram public URL case passes with deterministic `[INTAKE_RESOLVED] kind=instagram`; `test/intake/instagram-adapter.test.ts` validates supported URL handling |
| 2 | Auth-required Instagram URLs return `INSTAGRAM_AUTH_REQUIRED` | verified | `test/intake/instagram-adapter.test.ts` login-required boundary and adapter mapping cases pass; `test/intake/intake-matrix.test.ts` asserts deterministic propagation |
| 3 | CLI exits non-zero with remediation guidance for auth-required Instagram cases | verified | `test/cli/intake-cli.test.ts` auth-required case asserts exit code `2`, error code `[INSTAGRAM_AUTH_REQUIRED]`, and public-only guidance |

## Required Artifacts
| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/intake/policy.ts` | Instagram public URL classification policy | verified | Detects Instagram hosts and `/p/`, `/reel/`, `/tv/` path classes |
| `src/intake/resolver.ts` | Resolver dispatch to Instagram adapter | verified | Routes `instagram` classification to `resolveInstagramSource()` |
| `src/intake/adapters/instagram.ts` | Adapter contract mapping for Instagram URLs | verified | Validates URL shape and returns normalized source contract |
| `src/intake/tools/yt-dlp.ts` | Auth-required and non-auth Instagram failure mapping | verified | Detects login/challenge/private signatures -> `INSTAGRAM_AUTH_REQUIRED`; keeps fallback `INSTAGRAM_EXTRACT_FAILED` |
| `src/errors/cli-errors.ts` | Stable Instagram public error constructors | verified | Includes `INSTAGRAM_URL_INVALID`, `INSTAGRAM_AUTH_REQUIRED`, `INSTAGRAM_EXTRACT_FAILED` |
| `test/intake/instagram-adapter.test.ts` + `test/cli/intake-cli.test.ts` | Smoke coverage for public success + auth-required failure | verified | Both files include passing success/failure assertions |
| `src/cli/command-contract.ts` + `README.md` | User-facing contract text aligned with implemented Phase 3 behavior | verified | Notes and examples reflect active Instagram public intake and auth-required behavior |

## Key Link Verification
| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/intake/resolver.ts` | `src/intake/adapters/instagram.ts` | switch dispatch | verified | `instagram` classification delegates to Instagram adapter boundary |
| `src/intake/adapters/instagram.ts` | `src/intake/tools/yt-dlp.ts` | adapter call | verified | Adapter uses `resolveInstagramWithYtDlp()` for extraction |
| `src/intake/tools/yt-dlp.ts` | `src/errors/cli-errors.ts` | constructor mapping | verified | Auth-required and generic extraction failures map to stable public codes |
| `src/cli/build-cli.ts` + `src/cli/handlers.ts` | `formatCliError` output | error formatting pipeline | verified | CLI surfaces deterministic machine-readable codes and guidance |

## Requirements Coverage
| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| SRC-02 | complete | |
| SRC-03 | complete | |

## Validation Commands

- `bun test test/intake/instagram-adapter.test.ts`
- `bun test test/intake/intake-matrix.test.ts test/cli/intake-cli.test.ts test/cli/help.test.ts`
- `bun test`

## Result

Phase goal achieved. Instagram public intake is implemented through the baseline `pi-tube <input>` contract with deterministic auth-required behavior, non-zero CLI exits, and aligned smoke/documentation coverage.
