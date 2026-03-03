---
phase: 2
slug: core-source-intake
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-02
---

# Phase 2 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test |
| **Config file** | none (Bun default discovery) |
| **Quick run command** | `bun test test/intake/source-resolver.test.ts` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~30-60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test test/intake/source-resolver.test.ts`
- **After every plan wave:** Run `bun test test/intake/*.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | SRC-05 | unit | `bun test test/intake/source-resolver.test.ts` | ❌ Wave 0 | ⬜ pending |
| 2-02-01 | 02 | 2 | SRC-01 | integration | `bun test test/intake/youtube-adapter.test.ts` | ❌ Wave 0 | ⬜ pending |
| 2-03-01 | 03 | 2 | SRC-04,SRC-06 | unit/integration | `bun test test/intake/direct-url-adapter.test.ts test/intake/local-file-adapter.test.ts` | ❌ Wave 0 | ⬜ pending |
| 2-04-01 | 04 | 3 | SRC-01,SRC-04,SRC-05,SRC-06 | integration | `bun test test/intake/intake-matrix.test.ts` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending / ✅ green / ❌ red / ⚠ flaky*

---

## Wave 0 Requirements

- [ ] `test/intake/source-resolver.test.ts` - resolver/classifier fast-fail coverage
- [ ] `test/intake/youtube-adapter.test.ts` - yt-dlp adapter contract coverage
- [ ] `test/intake/direct-url-adapter.test.ts` - direct media URL policy coverage
- [ ] `test/intake/local-file-adapter.test.ts` - local file normalization coverage
- [ ] `test/intake/intake-matrix.test.ts` - source matrix integration coverage

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-world public YouTube URL smoke check on developer machine | SRC-01 | External network and platform variability may not be stable in CI | Run `pi-tube <youtube-url>` and confirm intake stage resolves source without policy failure |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
