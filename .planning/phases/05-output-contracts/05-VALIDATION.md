---
phase: 5
slug: output-contracts
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-03-02
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test |
| **Config file** | none |
| **Quick run command** | `bun test test/output/output-contract.test.ts` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test test/output/output-contract.test.ts`
- **After every plan wave:** Run `bun test test/output/*.test.ts test/cli/output-cli.test.ts test/cli/provider-status.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | OUT-05, OUT-06 | unit | `bun test test/output/output-contract.test.ts` | ❌ W1 | ⬜ pending |
| 05-01-02 | 01 | 1 | OUT-03, OUT-06 | unit | `bun test test/output/output-contract.test.ts` | ❌ W1 | ⬜ pending |
| 05-01-03 | 01 | 1 | OUT-06 | integration | `bun test test/output/output-contract.test.ts test/transcription/transcription-service.test.ts` | ✅/❌ W1 | ⬜ pending |
| 05-02-01 | 02 | 2 | OUT-01, OUT-02 | unit | `bun test test/output/markdown-renderer.test.ts` | ❌ W2 | ⬜ pending |
| 05-02-02 | 02 | 2 | OUT-03 | unit/integration | `bun test test/output/markdown-renderer.test.ts test/cli/output-cli.test.ts` | ❌ W2 | ⬜ pending |
| 05-02-03 | 02 | 2 | OUT-01, OUT-02, OUT-03 | integration/cli | `bun test test/cli/output-cli.test.ts` | ❌ W2 | ⬜ pending |
| 05-03-01 | 03 | 3 | OUT-04, OUT-05 | unit | `bun test test/output/json-renderer.test.ts` | ❌ W3 | ⬜ pending |
| 05-03-02 | 03 | 3 | OUT-04 | integration/cli | `bun test test/cli/output-cli.test.ts` | ❌ W3 | ⬜ pending |
| 05-03-03 | 03 | 3 | OUT-06 | integration | `bun test test/output/output-parity.test.ts test/cli/output-cli.test.ts` | ❌ W3 | ⬜ pending |
| 05-04-01 | 04 | 4 | CLI-04 | integration/cli | `bun test test/cli/provider-status.test.ts` | ❌ W4 | ⬜ pending |
| 05-04-02 | 04 | 4 | CLI-03 | integration/docs | `bun test test/cli/help.test.ts test/cli/output-cli.test.ts` | ✅/❌ W4 | ⬜ pending |
| 05-04-03 | 04 | 4 | CLI-03, CLI-04 | regression | `bun test` | ✅ | ⬜ pending |

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
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
