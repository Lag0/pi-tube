---
phase: 4
slug: transcription-providers
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-03-02
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test |
| **Config file** | none |
| **Quick run command** | `bun test test/transcription/provider-contract.test.ts` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test test/transcription/provider-contract.test.ts`
- **After every plan wave:** Run `bun test test/transcription/*.test.ts test/cli/transcription-cli.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | TRNS-03 | unit | `bun test test/transcription/provider-contract.test.ts` | ❌ W1 | ⬜ pending |
| 04-01-02 | 01 | 1 | TRNS-04 | unit/integration | `bun test test/transcription/provider-contract.test.ts` | ❌ W1 | ⬜ pending |
| 04-02-01 | 02 | 2 | TRNS-01, TRNS-03 | unit | `bun test test/transcription/deepgram-provider.test.ts` | ❌ W2 | ⬜ pending |
| 04-02-02 | 02 | 2 | TRNS-04 | unit | `bun test test/transcription/deepgram-provider.test.ts` | ❌ W2 | ⬜ pending |
| 04-03-01 | 03 | 2 | TRNS-02, TRNS-03 | unit | `bun test test/transcription/groq-provider.test.ts` | ❌ W2 | ⬜ pending |
| 04-03-02 | 03 | 2 | TRNS-04 | unit | `bun test test/transcription/groq-provider.test.ts` | ❌ W2 | ⬜ pending |
| 04-04-01 | 04 | 3 | TRNS-01, TRNS-02 | integration | `bun test test/transcription/transcription-service.test.ts test/cli/transcription-cli.test.ts` | ❌ W3 | ⬜ pending |
| 04-04-03 | 04 | 3 | TRNS-04 | integration/cli | `bun test test/transcription/transcription-service.test.ts test/cli/transcription-cli.test.ts` | ❌ W3 | ⬜ pending |

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

