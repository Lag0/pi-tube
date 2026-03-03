# Phase 5: Output Contracts - Research

**Researched:** 2026-03-02
**Domain:** Deterministic Markdown/JSON output contracts for transcription artifacts
**Confidence:** HIGH

## User Constraints

No `05-CONTEXT.md` exists yet for this phase.

Planning constraints are derived from roadmap, requirements, and current project state:

### Locked by roadmap + requirements
- Phase 5 must cover `OUT-01`, `OUT-02`, `OUT-03`, `OUT-04`, `OUT-05`, `OUT-06`, `CLI-03`, and `CLI-04`.
- Default output contract remains human-readable while preserving deterministic machine parsing behavior.
- Markdown output must include YAML frontmatter plus a fixed summary format (1 paragraph with 2-4 sentences and 5 key-point bullets).
- JSON output must be explicitly opt-in with `--json` and include a deterministic `schema_version`.
- Markdown and JSON must represent the same transcription information from one canonical model.
- A provider readiness/status command must be available in the CLI contract.

### Locked by current codebase trajectory
- Current CLI baseline is `pi-tube <input>` with source and transcription execution already implemented.
- Current output is line-oriented deterministic markers from `formatBaselineIntakeResult()` in `src/cli/handlers.ts`.
- Provider selection/language precedence and provider error taxonomy from Phase 4 must remain stable.
- Current canonical execution result from `transcribeFromResolvedSource()` includes transcript text and language metadata, but no explicit output artifact layer yet.

### Claude's Discretion
- Exact output module/file layout (`src/output/*` and related contracts) as long as one canonical artifact model feeds both renderers.
- Canonical `schema_version` value and versioning policy for future-compatible evolution.
- Provider status command shape (single command name and exact table/JSON fields) as long as deterministic and documented.

### Deferred for later phases
- CLI configuration workflow (`CLI-02`) remains Phase 6.
- Full release-gate fixtures/taxonomy hardening (`ERR-*`) remains Phase 6.

## Summary

Phase 5 should introduce an explicit output-contract layer between transcription execution and CLI rendering. Today the CLI prints deterministic marker lines directly from transcription execution results. That was correct for earlier phases, but now `OUT-*` requires richer artifacts (frontmatter, fixed summary, optional timestamped transcript sections, and parity JSON) that should not be hand-assembled inside CLI handlers.

The safest path is contract-first: define a canonical artifact schema, then implement Markdown and JSON renderers from that schema. Keep one source of truth so parity checks are mechanical rather than inferred. This minimizes drift risk and makes regression tests straightforward.

Provider status should be implemented as a separate deterministic CLI command that reports readiness based on configured credentials and known provider registrations. This can ship in the same phase without disturbing baseline `pi-tube <input>` transcription flow.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun runtime APIs | Bun 1.3.x | CLI execution + tests | Existing project runtime baseline |
| TypeScript 5.x | project default | Canonical output contract types | Ensures deterministic shape enforcement |
| `bun:test` | Bun built-in | Renderer + CLI contract tests | Existing test framework with fast execution |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node/Bun stdlib (`Date`, string utils) | runtime built-in | Timestamp + deterministic formatting | Preferred first for low complexity |
| `JSON.stringify` with stable object construction | runtime built-in | Deterministic JSON output | Always for `--json` contract output |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|-----------|-----------|----------|
| Manual frontmatter string builder | Third-party YAML library | Fewer escaping edge cases but extra dependency + version drift |
| One canonical artifact schema | Separate Markdown/JSON intermediate models | Faster initial coding but high parity drift risk |
| Explicit provider status command | Implicit status via failed transcribe attempts | Less CLI surface but poor agent ergonomics and unclear readiness signal |

## Architecture Patterns

### Recommended Project Structure
```
src/
├── output/
│   ├── contract.ts
│   ├── build-artifact.ts
│   ├── markdown.ts
│   └── json.ts
├── cli/
│   ├── build-cli.ts
│   ├── handlers.ts
│   └── command-contract.ts
└── transcription/
    └── service.ts
```

### Pattern 1: Canonical Output Artifact Contract
**What:** Define one typed `OutputArtifact` containing metadata, summary, transcript body, optional segments, provider/language context, and schema version.
**Why:** Guarantees Markdown and JSON are views over identical data (`OUT-06`).

### Pattern 2: Renderer Isolation
**What:** Keep formatting logic in dedicated renderers (`renderMarkdown`, `renderJson`) and keep CLI handler orchestration thin.
**Why:** Prevents contract formatting from scattering across CLI parsing code and reduces regression risk.

### Pattern 3: Deterministic Serialization Rules
**What:** Explicit field ordering, stable defaults, normalized timestamps, and no nondeterministic collections.
**Why:** Agent workflows depend on reproducible output across runs.

### Pattern 4: Provider Status as Contract Command
**What:** Add a deterministic provider-readiness command that reports configured providers and missing credential env vars.
**Why:** Satisfies `CLI-04` while reducing support noise from avoidable auth failures.

### Anti-Patterns to Avoid
- Building Markdown directly from provider adapters.
- Generating Markdown and JSON through separate business logic paths.
- Allowing summary format variation across providers or source types.
- Returning provider status by triggering live API calls in status command (nondeterministic + slow).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-path business logic duplication | Separate Markdown and JSON assembly trees | Single canonical artifact builder | Eliminates drift between output modes |
| Non-deterministic summaries | AI-generated free-form summaries in CLI path | Rule-based deterministic summary builder | Stable parsing and regression behavior |
| Runtime provider probing for status | Real-time API health checks in command | Static readiness report from registry + env presence | Fast, offline, deterministic status contract |

## Common Pitfalls

### Pitfall 1: Markdown/JSON parity drift
**What goes wrong:** Output fields diverge over time; tests only validate one path.
**How to avoid:** Build artifact once, feed both renderers, add parity tests asserting semantic equivalence.

### Pitfall 2: Summary format subtly changes
**What goes wrong:** Markdown summary loses fixed paragraph + 5 bullets requirement.
**How to avoid:** Encapsulate summary generation in deterministic helper and unit-test exact structure constraints.

### Pitfall 3: Timestamp section instability
**What goes wrong:** Segment timestamps appear in one provider path but disappear or reorder in another.
**How to avoid:** Canonical segment schema with deterministic sort/order and fallback when providers return no segments.

### Pitfall 4: `--json` mode leaks non-contract fields
**What goes wrong:** Debug fields or provider-native payloads leak into JSON output.
**How to avoid:** Strict JSON renderer from typed contract only and snapshot tests for field-set stability.

## Open Questions

1. **Canonical summary source**
   - Recommendation: deterministic template from transcript/provider metadata in Phase 5; defer advanced summarization heuristics.
2. **Segment schema granularity**
   - Recommendation: define optional `segments[]` with start/end/text now, allow provider-specific extras in future schema versions.
3. **Provider status command name**
   - Recommendation: use `pi-tube provider-status` for low parser complexity and explicit meaning.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `bun:test` |
| Config file | none (Bun default discovery) |
| Quick run command | `bun test test/output/output-contract.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OUT-01 | Markdown output includes YAML frontmatter metadata | unit/integration | `bun test test/output/markdown-renderer.test.ts test/cli/output-cli.test.ts` | ❌ Wave 2 |
| OUT-02 | Markdown summary uses fixed paragraph + 5 bullets format | unit/integration | `bun test test/output/markdown-renderer.test.ts test/cli/output-cli.test.ts` | ❌ Wave 2 |
| OUT-03 | Transcript section includes timestamps when segment data exists | unit/integration | `bun test test/output/markdown-renderer.test.ts test/output/output-contract.test.ts` | ❌ Wave 1/2 |
| OUT-04 | `--json` returns deterministic JSON output contract | integration/cli | `bun test test/output/json-renderer.test.ts test/cli/output-cli.test.ts` | ❌ Wave 3 |
| OUT-05 | JSON output includes `schema_version` and deterministic fields | unit/integration | `bun test test/output/json-renderer.test.ts` | ❌ Wave 3 |
| OUT-06 | Markdown and JSON represent equivalent transcription information | integration | `bun test test/output/output-parity.test.ts test/cli/output-cli.test.ts` | ❌ Wave 3 |
| CLI-03 | Agent-focused `--json` usage is documented with examples | docs/contract | `bun test test/cli/help.test.ts test/cli/output-cli.test.ts` | ❌ Wave 4 |
| CLI-04 | Provider status command reports readiness deterministically | integration/cli | `bun test test/cli/provider-status.test.ts` | ❌ Wave 4 |

### Sampling Rate
- **Per task commit:** `bun test test/output/output-contract.test.ts`
- **Per wave merge:** `bun test test/output/*.test.ts test/cli/output-cli.test.ts test/cli/provider-status.test.ts`
- **Phase gate:** `bun test`

---
