---
phase: 7
slug: melhorar-ux-da-cli-help-colorido-com-subcomandos-layout-intuitivo-e-paridade-1-1-com-experi-ncia-do-openclaw
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-03-04
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test |
| **Config file** | none |
| **Quick run command** | `bun test test/cli/help.test.ts` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~75 seconds |

---

## Sampling Rate

- **After every task commit:** run the `<automated>` command from the active task.
- **After every wave:** run all CLI suites touched in the wave.
- **Before `$gsd-verify-work`:** full `bun test` must pass.
- **Max feedback latency:** 75 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | CLI-01 | integration/help | `bun test test/cli/help.test.ts` | ✅ | ⬜ pending |
| 07-01-02 | 01 | 1 | CLI-01, ERR-02 | integration/parse | `bun test test/cli/error-exit-codes.test.ts test/cli/help.test.ts` | ✅ | ⬜ pending |
| 07-01-03 | 01 | 1 | CLI-01 | contract | `bun test test/cli/help.test.ts test/cli/entrypoint.test.ts` | ✅ | ⬜ pending |
| 07-02-01 | 02 | 2 | CLI-02 | integration/config | `bun test test/cli/config-cli.test.ts` | ✅ | ⬜ pending |
| 07-02-02 | 02 | 2 | CLI-02, ERR-02 | integration/errors | `bun test test/cli/config-cli.test.ts test/cli/error-exit-codes.test.ts` | ✅ | ⬜ pending |
| 07-02-03 | 02 | 2 | CLI-02 | contract/migration | `bun test test/cli/config-cli.test.ts test/cli/help.test.ts` | ✅ | ⬜ pending |
| 07-03-01 | 03 | 2 | CLI-03 | integration/setup | `bun test test/cli/setup-cli.test.ts` | ✅ | ⬜ pending |
| 07-03-02 | 03 | 2 | CLI-03, CLI-01 | integration/help | `bun test test/cli/setup-cli.test.ts test/cli/help.test.ts` | ✅ | ⬜ pending |
| 07-03-03 | 03 | 2 | CLI-03 | regression | `bun test test/cli/setup-cli.test.ts test/cli/output-cli.test.ts` | ✅ | ⬜ pending |
| 07-04-01 | 04 | 3 | CLI-01 | docs/contract | `bun test test/cli/help.test.ts test/cli/install-flow.test.ts` | ✅ | ⬜ pending |
| 07-04-02 | 04 | 3 | CLI-01, CLI-02, CLI-03 | full regression | `bun test` | ✅ | ⬜ pending |
| 07-04-03 | 04 | 3 | ERR-02 | failure-path regression | `bun test test/cli/error-exit-codes.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing Bun test harness is available.
- Existing CLI test suites for help/config/setup/error behavior already exist.
- No framework bootstrap work is required.

---

## Manual-Only Verifications

- Visual check in terminal for ANSI help readability (`pi-tube --help`, `pi-tube config --help`, `pi-tube setup --help`).
- Manual no-color check (`pi-tube --no-color --help`) for fallback readability.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 75s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
