---
phase: 6
slug: reliability-release-gates
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-03-02
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test |
| **Config file** | none |
| **Quick run command** | `bun test test/cli/config-cli.test.ts` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** run the task verify command from PLAN.md.
- **After every wave:** run wave-focused suites plus touched CLI tests.
- **Before `$gsd-verify-work`:** full suite + fixture checks must be green.
- **Max feedback latency:** 60 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | CLI-02 | integration/cli | `bun test test/cli/config-cli.test.ts` | ❌ W1 | ⬜ pending |
| 06-01-02 | 01 | 1 | CLI-02, ERR-03 | integration | `bun test test/cli/config-cli.test.ts test/cli/provider-status.test.ts` | ✅/❌ W1 | ⬜ pending |
| 06-01-03 | 01 | 1 | CLI-02 | docs/contract | `bun test test/cli/help.test.ts test/cli/install-flow.test.ts` | ✅ | ⬜ pending |
| 06-02-01 | 02 | 2 | ERR-01, ERR-02 | unit | `bun test test/errors/error-taxonomy.test.ts` | ❌ W2 | ⬜ pending |
| 06-02-02 | 02 | 2 | ERR-03 | integration/cli | `bun test test/cli/error-exit-codes.test.ts` | ❌ W2 | ⬜ pending |
| 06-02-03 | 02 | 2 | ERR-01, ERR-02, ERR-03 | integration | `bun test test/cli/error-exit-codes.test.ts test/cli/transcription-cli.test.ts` | ✅/❌ W2 | ⬜ pending |
| 06-03-01 | 03 | 3 | ERR-04 | fixture | `bun test test/output/golden-fixture.test.ts` | ❌ W3 | ⬜ pending |
| 06-03-02 | 03 | 3 | ERR-04 | integration | `bun test test/output/golden-fixture.test.ts test/output/output-parity.test.ts` | ✅/❌ W3 | ⬜ pending |
| 06-03-03 | 03 | 3 | ERR-04 | regression | `bun test test/output/golden-fixture.test.ts test/cli/output-cli.test.ts` | ✅/❌ W3 | ⬜ pending |
| 06-04-01 | 04 | 4 | ERR-02, ERR-04 | ci | `bun test` (via CI workflow) | ✅ | ⬜ pending |
| 06-04-02 | 04 | 4 | ERR-04 | ci/fixture | `bun run scripts/verify-fixtures.ts` (or equivalent) | ❌ W4 | ⬜ pending |
| 06-04-03 | 04 | 4 | ERR-01, ERR-02, ERR-03, ERR-04 | release-gate | CI run + local smoke checks | ❌ W4 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing Bun test infrastructure is in place.
- Existing CLI integration test harness is in place.

---

## Manual-Only Verifications

- CI workflow execution on pull request branch.
- Release checklist sign-off before tagging.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
