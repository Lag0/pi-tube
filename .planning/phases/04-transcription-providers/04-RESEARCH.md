# Phase 4: Transcription Providers - Research

**Researched:** 2026-03-02
**Domain:** Provider abstraction and adapter delivery for Deepgram + Groq in Bun/TypeScript
**Confidence:** HIGH

## User Constraints

No `04-CONTEXT.md` exists yet for this phase.

Planning constraints are derived from roadmap, requirements, and current project state:

### Locked by roadmap + requirements
- Phase 4 must cover `TRNS-01`, `TRNS-02`, `TRNS-03`, and `TRNS-04`.
- User must be able to choose Deepgram or Groq without changing the baseline command contract.
- User language preference must be accepted and language metadata should be returned when providers expose it.
- Provider-layer failures must map to stable public error classes.

### Locked by current codebase trajectory
- Baseline command contract remains `pi-tube <input>` with deterministic machine-readable output markers.
- Source intake stays under `src/intake/` and returns typed `ResolvedSource` data.
- Public errors must flow through `CliError` + `formatCliError` for deterministic exit code and guidance.
- Existing test approach uses `bun:test` and dependency injection/mocking around external boundaries.

### Claude's Discretion
- Exact provider-selection precedence (CLI flag vs env fallback) as long as baseline contract remains stable.
- Whether provider adapters use SDK clients or direct HTTP requests.
- Exact canonical transcription result schema shape before Phase 5 renderers land.

### Deferred for later phases
- Markdown/JSON output contract finalization (`OUT-*`) remains Phase 5.
- Provider status command and agent-JSON usage docs remain Phase 5 (`CLI-03`, `CLI-04`).
- Config command flow and full taxonomy finalization remain Phase 6 (`CLI-02`, `ERR-*`).

## Summary

Phase 4 should introduce a contract-first transcription layer that sits after intake resolution and before output rendering. The safest path is:
1. Define a canonical provider-agnostic request/response contract.
2. Implement Deepgram and Groq adapters behind one interface.
3. Route provider-specific failures into stable public `CliError` constructors.
4. Wire provider selection into baseline CLI execution while preserving input/output format stability.

Given current project conventions, using a small provider service plus adapter boundary is the lowest-risk architecture. It keeps provider details isolated and makes Phase 5 renderer work straightforward because canonical transcript data already exists.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun runtime APIs | Bun 1.3.x | HTTP/file execution + tests | Existing runtime baseline |
| TypeScript 5.x | project default | Canonical transcription types + adapters | Enforces contract fidelity |
| `bun:test` | Bun built-in | Adapter and CLI regression coverage | Existing project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fetch`, `FormData`, `Headers` | Bun/WHATWG built-ins | Provider HTTP requests without SDK lock-in | Preferred default for adapter boundaries |
| Provider SDKs (optional) | latest compatible | Fallback if HTTP surfaces are missing/unstable | Only if direct HTTP path is impractical |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|-----------|-----------|----------|
| Direct HTTP adapters | Official SDKs for each provider | Less request plumbing but heavier dependency and mock complexity |
| Canonical provider errors | Raw provider messages to CLI | Faster initial work but unstable public contract |
| Shared service + adapters | Inline provider branching in CLI handlers | Faster to start but poor maintainability and weaker tests |

## Architecture Patterns

### Recommended Project Structure
```
src/
├── transcription/
│   ├── types.ts
│   ├── service.ts
│   └── providers/
│       ├── provider.ts
│       ├── deepgram.ts
│       └── groq.ts
├── cli/
│   ├── handlers.ts
│   └── command-contract.ts
└── errors/
    └── cli-errors.ts
```

### Pattern 1: Contract-First Provider Interface
**What:** Define a canonical `TranscriptionProvider` contract (`transcribe(request) -> canonical result`).
**Why:** Ensures provider switching does not alter downstream CLI/output behavior.

### Pattern 2: Provider Failure Mapping at Adapter Boundary
**What:** Map provider-specific HTTP/API failures to stable `CliError` constructors before returning to service/CLI.
**Why:** Keeps failure semantics deterministic and avoids leaking vendor-specific strings into user contracts.

### Pattern 3: Selection in Service Layer, Not CLI Formatting
**What:** Keep provider selection in `transcription/service.ts`; CLI only provides preferences and renders canonical results.
**Why:** Maintains clean separation and makes future non-CLI consumers reusable.

### Anti-Patterns to Avoid
- Embedding provider-specific JSON response parsing in CLI handlers.
- Returning provider-native response payloads directly in CLI output.
- Mixing output-contract work (Phase 5) into provider adapter implementation (Phase 4).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multipart/form-data encoding | custom byte writer | `FormData` + `fetch` | Lower bug surface |
| Error formatting in adapters | inline string concatenation | `CliError` constructors | Stable machine-readable output |
| Provider selection parser | ad-hoc string checks | typed enum + validator helper | Deterministic behavior and tests |

## Common Pitfalls

### Pitfall 1: Provider-specific response shape leaks into CLI
**What goes wrong:** Switching provider changes output fields or formatting.
**How to avoid:** Normalize both adapters into one canonical `TranscriptionResult` type.

### Pitfall 2: Language preference accepted but ignored
**What goes wrong:** `TRNS-03` appears implemented but provider requests never receive language option.
**How to avoid:** Explicit tests asserting request payload includes selected language when provided.

### Pitfall 3: Non-deterministic provider errors
**What goes wrong:** Provider API wording changes break automation checks.
**How to avoid:** Map failures to stable public error codes and assert by code in tests.

## Open Questions

1. **Provider selection UX in Phase 4**
   - Recommendation: Keep `pi-tube <input>` as canonical path; add `--provider <deepgram|groq>` with env fallback.
2. **Language metadata precedence**
   - Recommendation: Store both `requestedLanguage` and `detectedLanguage` when available; otherwise return requested only.
3. **Credential discovery surface**
   - Recommendation: Use env vars only in Phase 4 (`DEEPGRAM_API_KEY`, `GROQ_API_KEY`); full config command remains Phase 6.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `bun:test` |
| Config file | none (Bun default discovery) |
| Quick run command | `bun test test/transcription/provider-contract.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRNS-01 | Deepgram provider can be selected and returns canonical result | unit/integration | `bun test test/transcription/deepgram-provider.test.ts test/transcription/transcription-service.test.ts` | ❌ Wave 2/3 |
| TRNS-02 | Groq provider can be selected and returns canonical result | unit/integration | `bun test test/transcription/groq-provider.test.ts test/transcription/transcription-service.test.ts` | ❌ Wave 2/3 |
| TRNS-03 | Language preference passes through and metadata is returned | unit/integration | `bun test test/transcription/deepgram-provider.test.ts test/transcription/groq-provider.test.ts` | ❌ Wave 2/3 |
| TRNS-04 | Provider-layer failures map to stable public error classes | unit/cli smoke | `bun test test/transcription/transcription-service.test.ts test/cli/transcription-cli.test.ts` | ❌ Wave 3 |

### Sampling Rate
- **Per task commit:** `bun test test/transcription/provider-contract.test.ts`
- **Per wave merge:** `bun test test/transcription/*.test.ts test/cli/transcription-cli.test.ts`
- **Phase gate:** `bun test`

