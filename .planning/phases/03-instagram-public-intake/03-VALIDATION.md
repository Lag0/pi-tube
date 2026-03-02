---
phase: 3
slug: instagram-public-intake
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-03-02
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test |
| **Config file** | none |
| **Quick run command** | `bun test test/intake/instagram-adapter.test.ts` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test test/intake/instagram-adapter.test.ts`
- **After every plan wave:** Run `bun test test/intake/instagram-adapter.test.ts test/cli/intake-cli.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | SRC-02 | unit | `bun test test/intake/instagram-adapter.test.ts` | ❌ W1 | ⬜ pending |
| 03-01-02 | 01 | 1 | SRC-02 | unit/integration | `bun test test/intake/instagram-adapter.test.ts` | ❌ W1 | ⬜ pending |
| 03-02-02 | 02 | 2 | SRC-03 | unit | `bun test test/intake/instagram-adapter.test.ts` | ❌ W1 | ⬜ pending |
| 03-03-01 | 03 | 3 | SRC-02,SRC-03 | integration | `bun test test/intake/intake-matrix.test.ts test/cli/intake-cli.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

- All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
