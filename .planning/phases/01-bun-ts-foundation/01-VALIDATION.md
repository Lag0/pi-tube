---
phase: 01
slug: bun-ts-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-02
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Bun 1.x) |
| **Config file** | none — Bun default test discovery |
| **Quick run command** | `bun test test/cli/help.test.ts` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test test/cli/help.test.ts`
- **After every plan wave:** Run `bun test`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | MIGR-01 | integration | `bun test test/cli/entrypoint.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | MIGR-02 | unit | `bun test test/cli/identity.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 2 | CLI-01 | snapshot | `bun test test/cli/help.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 3 | MIGR-03 | integration | `bun test test/cli/no-python-runtime.test.ts` | ❌ W0 | ⬜ pending |
| 01-04-01 | 04 | 4 | MIGR-01, CLI-01 | integration | `bun test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/cli/help.test.ts` — CLI help structure and example coverage
- [ ] `test/cli/entrypoint.test.ts` — Bun/TS `pi-tube` entrypoint execution checks
- [ ] `test/cli/identity.test.ts` — command identity remains `pi-tube`
- [ ] `test/cli/no-python-runtime.test.ts` — primary path does not require Python runtime

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Install flow usability on macOS/Linux shell | MIGR-01, MIGR-03 | Real shell PATH/permission variance | Run documented install command in clean shell and verify `pi-tube --help` works immediately |
| Help readability and copy-paste utility | CLI-01 | Tone/readability quality is subjective | Validate sections and examples are clear to a first-time user |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
