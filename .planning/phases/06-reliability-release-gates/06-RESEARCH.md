# Phase 6: Reliability & Release Gates - Research

**Researched:** 2026-03-02
**Domain:** Config UX, stable error taxonomy, regression fixtures, and CI release gates
**Confidence:** HIGH

## User Constraints

No `06-CONTEXT.md` exists yet for this phase.

Planning constraints are derived from roadmap, requirements, and completed Phase 5 artifacts.

### Locked by roadmap + requirements
- Phase 6 must cover `CLI-02`, `ERR-01`, `ERR-02`, `ERR-03`, and `ERR-04`.
- A user-facing config flow must exist for provider credentials in addition to env-based configuration.
- Failures must use stable machine-readable error codes and correct non-zero exits.
- Error outputs must include concise remediation guidance.
- At least one golden output fixture must protect contract regressions.
- CI quality gates must enforce reliability checks before release.

### Locked by current codebase trajectory
- Current error handling already centralizes many errors via `src/errors/cli-errors.ts` and `formatCliError()`.
- Provider credentials currently come from env vars only (`DEEPGRAM_API_KEY`, `GROQ_API_KEY`).
- CLI surface currently supports baseline transcription, `--json`, and `provider-status` but no `config` command.
- Output contract stability is validated in tests but not by golden fixture snapshots.
- No committed CI workflow currently enforces tests/fixture checks in automation.

### Claude's Discretion
- Exact config storage location/format (`~/.config` vs project-local) as long as precedence is deterministic and documented.
- Final taxonomy grouping and helper structure for existing/new errors.
- Golden fixture format (`.json`, `.md`, or both) and fixture verification tooling design.
- CI workflow shape and release checklist location.

### Deferred for later phases
- Multi-profile environment management and secret-manager integrations.
- Advanced lint/typecheck pipeline expansion beyond core release gates.
- Offline/local transcription provider integration.

## Summary

Phase 6 should harden operational reliability without destabilizing Phase 5 output contracts. The best route is to implement a deterministic config boundary first (CLI-02), then finalize a centralized error taxonomy and exit policy (ERR-01..03), then lock output behavior with golden fixtures (ERR-04), and finally enforce everything through CI gates and a release checklist.

The architecture should prioritize deterministic behavior and minimal hidden state. Config resolution must be explicit and testable: CLI flags > config command state > env defaults (for provider credentials and related settings). Error contracts should consolidate around one code registry and helpers so additions do not fragment behavior. Golden fixtures should be generated from stable mock inputs and validated in tests/CI to prevent accidental schema drift.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun runtime APIs | Bun 1.3.x | CLI execution/tests/scripts | Existing runtime baseline |
| TypeScript 5.x | project default | Strong typing for config/error contracts | Existing codebase standard |
| `bun:test` | Bun built-in | Contract and fixture regressions | Existing testing baseline |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node `fs`/`path` | runtime built-in | Config persistence and fixture IO | Config command + fixture checks |
| GitHub Actions | latest | CI quality gates | Required for release-hardening |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|-----------|-----------|----------|
| Local config file managed by CLI | Env-only forever | Simpler but fails CLI-02 and poor UX |
| One centralized error-code registry | Ad-hoc string literals | Faster short-term, high contract drift risk |
| Golden fixtures in repo | Runtime snapshots only | Less maintenance, but weak release gate for drift |

## Architecture Patterns

### Pattern 1: Deterministic Config Resolution Chain
**What:** Introduce config command and persisted settings with explicit precedence and fallback.
**Why:** Enables CLI-02 while keeping behavior predictable for humans and agents.

### Pattern 2: Error Taxonomy as Source of Truth
**What:** Maintain a normalized catalog/mapping for all public error codes and exit behavior.
**Why:** Avoids contract fragmentation and stabilizes automation behavior.

### Pattern 3: Golden Fixture Contract Gate
**What:** Store one or more canonical output fixtures generated from fixed mock inputs and verify against runtime output.
**Why:** Detects output schema/format drift earlier than ad-hoc tests.

### Pattern 4: CI as Release Guardrail
**What:** Add deterministic workflow that runs tests and fixture verification on every push/PR.
**Why:** Prevents regressions from reaching release branches.

### Anti-Patterns to Avoid
- Mutating config from normal transcribe commands without explicit user action.
- Introducing provider-specific error strings directly in command handlers.
- Golden fixtures dependent on nondeterministic timestamps without normalization.
- CI steps that rely on external network calls for core pass/fail checks.

## Common Pitfalls

### Pitfall 1: Config precedence ambiguity
**What goes wrong:** Users see unpredictable provider selection between flags/env/config.
**How to avoid:** Define and test one precedence chain; document in help/README.

### Pitfall 2: Error-code regressions during refactors
**What goes wrong:** Existing codes/exit behavior change silently.
**How to avoid:** Add dedicated taxonomy tests and negative-path integration tests.

### Pitfall 3: Golden fixture false positives from timestamps
**What goes wrong:** Fixtures fail due to dynamic fields rather than contract drift.
**How to avoid:** Inject fixed timestamps in fixture-generation paths.

### Pitfall 4: CI checks too broad or flaky
**What goes wrong:** Slow/flaky pipelines reduce trust and get bypassed.
**How to avoid:** Keep gates deterministic, fast, and focused on contract reliability.

## Open Questions

1. **Config file location and portability**
   - Recommendation: start with project-scoped config file (`.pi-tube.json` or similar) for deterministic tests; optionally support user home path later.
2. **Scope of fixture coverage**
   - Recommendation: at least one full markdown+json golden pair from same mock input; expand after baseline passes.
3. **CI gate granularity**
   - Recommendation: single workflow with explicit steps: install -> tests -> fixture verify.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `bun:test` |
| Config file | none (Bun default) |
| Quick run command | `bun test test/cli/provider-status.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLI-02 | Config command manages provider credentials with deterministic precedence | integration/cli | `bun test test/cli/config-cli.test.ts test/transcription/transcription-service.test.ts` | ❌ Wave 1 |
| ERR-01 | Stable machine-readable error codes cover common failure classes | unit/integration | `bun test test/errors/error-taxonomy.test.ts test/cli/*-cli.test.ts` | ❌ Wave 2 |
| ERR-02 | Exit code policy remains stable across success/failure paths | integration/cli | `bun test test/cli/error-exit-codes.test.ts` | ❌ Wave 2 |
| ERR-03 | Error outputs include concise remediation guidance | unit/integration | `bun test test/errors/error-taxonomy.test.ts test/cli/error-exit-codes.test.ts` | ❌ Wave 2 |
| ERR-04 | Golden output fixtures prevent schema/format drift | fixture/regression | `bun test test/output/golden-fixture.test.ts` | ❌ Wave 3 |

### Sampling Rate
- **Per task commit:** run the task-specific `bun test ...` command from plan verify blocks.
- **Per wave:** run focused suites touched by the wave.
- **Phase gate:** run full suite + fixture verification command.

