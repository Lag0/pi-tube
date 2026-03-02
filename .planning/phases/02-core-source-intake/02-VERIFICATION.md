---
phase: 02-core-source-intake
verified: "2026-03-02T20:29:32Z"
status: passed
score: 4/4 must-haves verified
---

# Phase 02: core-source-intake — Verification

## Observable Truths
| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Baseline `pi-tube <input>` resolves YouTube inputs through deterministic intake boundary | verified | `test/cli/intake-cli.test.ts` YouTube case passes with mocked yt-dlp contract; `test/intake/youtube-adapter.test.ts` validates adapter success/failure mappings |
| 2 | Direct media URLs are accepted and normalized deterministically | verified | `test/intake/direct-url-adapter.test.ts` passes (`extension` extraction + fragment stripping) |
| 3 | Non-direct URLs fail early with `UNSUPPORTED_URL_NOT_DIRECT_MEDIA` | verified | `test/intake/source-resolver.test.ts`, `test/intake/intake-matrix.test.ts`, and `test/cli/intake-cli.test.ts` assert stable error code |
| 4 | Local file paths are normalized to absolute paths and validated by extension/existence | verified | `test/intake/local-file-adapter.test.ts` and local-file CLI case in `test/cli/intake-cli.test.ts` pass |

## Required Artifacts
| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/intake/resolver.ts` | Deterministic source classification and dispatch boundary | verified | Exists; routes to youtube/direct/local adapters with unsupported URL fast-fail |
| `src/intake/policy.ts` | Shared strict source policy helpers | verified | Exists; classifies URL/local input and enforces direct-media extension policy |
| `src/intake/adapters/youtube.ts` + `src/intake/tools/yt-dlp.ts` | YouTube adapter + external extraction boundary | verified | Exists; maps missing binary/extract/malformed output to stable CliError codes |
| `src/intake/adapters/direct-url.ts` | Direct-media URL normalization + strict gate | verified | Exists; only supports allowlisted media extensions |
| `src/intake/adapters/local-file.ts` | Local-file normalization + deterministic validation failures | verified | Exists; checks path existence/file-type/extension before contract return |
| `src/cli/handlers.ts` + `src/cli/build-cli.ts` | Baseline CLI integration into intake boundary | verified | Exists; `pi-tube <input>` now returns `[INTAKE_RESOLVED] kind=...` output markers |
| `test/intake/intake-matrix.test.ts` + `test/cli/intake-cli.test.ts` | Source-class matrix regression coverage | verified | Exist and pass in full suite |

## Key Link Verification
| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/cli/handlers.ts` | `src/intake/resolver.ts` | direct import | verified | `handleBaselineInput` delegates to `resolveSource(input)` |
| `src/intake/resolver.ts` | `src/intake/adapters/*` | dispatch switch | verified | Classifier routes `youtube`/`direct_url`/`local_file` to adapter modules |
| `src/intake/adapters/youtube.ts` | `src/intake/tools/yt-dlp.ts` | adapter boundary call | verified | `resolveYouTubeSource` invokes `resolveYouTubeWithYtDlp` |
| `src/cli/build-cli.ts` | `src/errors/cli-errors.ts` | failure formatting | verified | `formatCliError` preserves deterministic machine-readable error output |

## Requirements Coverage
| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| SRC-01 | complete | |
| SRC-04 | complete | |
| SRC-05 | complete | |
| SRC-06 | complete | |

## Validation Commands

- `bun test test/intake/source-resolver.test.ts`
- `bun test test/intake/youtube-adapter.test.ts`
- `bun test test/intake/direct-url-adapter.test.ts test/intake/local-file-adapter.test.ts`
- `bun test test/intake/intake-matrix.test.ts test/cli/intake-cli.test.ts`
- `bun test`

## Result

Phase goal achieved. Core source intake for YouTube/direct URL/local file is implemented with deterministic policy behavior, CLI integration, and passing regression coverage.
