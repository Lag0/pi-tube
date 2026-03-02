# Phase 3: Instagram Public Intake - Research

**Researched:** 2026-03-02
**Domain:** Public-only Instagram intake using existing extractor boundaries in Bun/TypeScript
**Confidence:** HIGH

## User Constraints

No `03-CONTEXT.md` exists yet for this phase.

Planning constraints are derived from roadmap, requirements, and current project state:

### Locked by roadmap + requirements
- Phase 3 must cover `SRC-02` and `SRC-03`.
- Scope is Instagram public post/reel/video URLs only.
- Auth-required Instagram cases must fail with `INSTAGRAM_AUTH_REQUIRED`.
- CLI must exit non-zero and include remediation guidance for auth-required cases.

### Locked by current codebase trajectory
- Keep source intake under `src/intake/` with adapter boundaries per source.
- Preserve `pi-tube <input>` as the active command contract.
- Maintain deterministic error mapping through `CliError` and formatter helpers.

### Claude's Discretion
- Exact URL policy for Instagram host/path variants.
- Whether to keep Instagram extraction logic in `yt-dlp.ts` or split to a dedicated extractor helper.
- How broad smoke coverage should be beyond the required success/auth-failure paths.

### Deferred for later phases
- Provider execution and transcript generation (Phase 4+).
- Authenticated/private Instagram extraction and cookies/session flows (out of scope).
- New top-level `instagram` command behavior; baseline path remains canonical.

## Summary

Phase 3 should extend the existing intake resolver with an Instagram branch that recognizes supported public Instagram URLs and resolves media via the extractor boundary. The safest architecture is parallel to YouTube: policy-level URL detection, adapter-level contract mapping, and tool-level extractor invocation/mapping.

The key risk is ambiguity between temporary network failure and auth-required responses. To satisfy `SRC-03` deterministically, the extractor boundary should classify known auth/login/challenge failure signatures and map them to a dedicated `INSTAGRAM_AUTH_REQUIRED` `CliError` with clear remediation. Non-auth extractor failures should keep a separate stable error code.

Recommended delivery order:
1. Add Instagram URL policy + adapter boundary with deterministic success path.
2. Add explicit auth-required error mapping and CLI-facing guidance.
3. Add smoke matrix tests for public success and auth-required failure, then align help/notes text.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun runtime APIs | Bun 1.3.x | Process execution + fast tests | Current runtime baseline |
| TypeScript 5.x | project default | Typed intake contracts + adapters | Prevents contract drift |
| `yt-dlp` subprocess boundary | existing module | Public media extraction | Already used for YouTube in Phase 2 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:url` URL parsing | stdlib | Instagram host/path normalization | Required for robust URL policy |
| `bun:test` | Bun built-in | Intake + CLI smoke tests | Deterministic regression coverage |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|-----------|-----------|----------|
| Reusing `yt-dlp` boundary | New Instagram scraping dependency | Extra maintenance and unstable API surface |
| Pattern-based auth detection from extractor stderr | Runtime headless browser checks | Higher complexity and nondeterministic tests |
| Baseline-input-only tests | Full end-to-end provider tests | Provider pipeline is out of scope for Phase 3 |

## Architecture Patterns

### Recommended Project Structure
```
src/
├── intake/
│   ├── types.ts
│   ├── policy.ts
│   ├── resolver.ts
│   ├── adapters/
│   │   ├── youtube.ts
│   │   ├── instagram.ts         # new in Phase 3
│   │   ├── direct-url.ts
│   │   └── local-file.ts
│   └── tools/
│       └── yt-dlp.ts            # expanded for Instagram mapping
├── errors/
│   └── cli-errors.ts            # INSTAGRAM_* error constructors
└── cli/
    ├── handlers.ts
    └── command-contract.ts
```

### Pattern 1: URL Policy Before Extraction
**What:** Validate Instagram host/path shape in `policy.ts` and resolver classification before invoking extractor.
**Why:** Keeps unsupported social URLs from leaking into expensive extractor paths.

### Pattern 2: Error-Code Mapping at Tool Boundary
**What:** Map stderr/auth signatures to stable `CliError` constructors in extraction tooling.
**Why:** Ensures all callers get deterministic `INSTAGRAM_AUTH_REQUIRED` behavior.

### Pattern 3: Contract-First Adapter Output
**What:** Return typed `ResolvedSource` object for Instagram similar to existing source kinds.
**Why:** Preserves downstream compatibility and keeps CLI formatting deterministic.

### Anti-Patterns to Avoid
- Adding authenticated/cookie/session extraction paths in v1.
- Relying on brittle one-off message strings in tests (assert code + key guidance).
- Mixing resolver classification rules with CLI message formatting.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Instagram media extraction internals | custom scraper parser | existing extractor subprocess boundary | Lower maintenance and consistent failure handling |
| Generic URL parsing logic | large regex-only parser | `URL` parser + explicit host/path checks | Safer normalization |
| Ad-hoc CLI error strings | inline throw strings | `CliError` constructors | Stable machine-readable contract |

## Common Pitfalls

### Pitfall 1: Treating all Instagram failures as auth-required
**What goes wrong:** Users get wrong remediation for network/availability issues.
**How to avoid:** Separate auth signatures from generic extractor failure codes.

### Pitfall 2: Partial URL support without explicit policy
**What goes wrong:** Some unsupported Instagram pages are classified as local or unsupported generic URL inconsistently.
**How to avoid:** Add explicit Instagram URL classifier with accepted path prefixes (`/p/`, `/reel/`, `/tv/`).

### Pitfall 3: No CLI-level regression for auth-required behavior
**What goes wrong:** Error code exists in adapter tests but CLI output/exit code regresses.
**How to avoid:** Add CLI smoke test asserting non-zero exit and guidance lines.

## Open Questions

1. **Which Instagram path forms should be accepted in Phase 3?**
   - Recommendation: Start with `instagram.com` and `www.instagram.com` hosts for `/p/`, `/reel/`, and `/tv/`.
2. **Should Instagram extraction reuse generic yt-dlp parse logic or dedicated helper?**
   - Recommendation: Reuse parser and add Instagram-specific auth-required classification function.
3. **How strict should auth signature matching be?**
   - Recommendation: Maintain a small curated set (login required, challenge required, private content requiring auth), covered by tests.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `bun:test` |
| Config file | none (Bun default discovery) |
| Quick run command | `bun test test/intake/instagram-adapter.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SRC-02 | Supported Instagram public URL resolves to intake source | unit/integration | `bun test test/intake/instagram-adapter.test.ts test/intake/intake-matrix.test.ts` | ❌ Wave 1/3 |
| SRC-03 | Auth-required Instagram response maps to `INSTAGRAM_AUTH_REQUIRED` | unit/cli smoke | `bun test test/intake/instagram-adapter.test.ts test/cli/intake-cli.test.ts` | ❌ Wave 2/3 |

### Sampling Rate
- **Per task commit:** `bun test test/intake/instagram-adapter.test.ts`
- **Per wave merge:** `bun test test/intake/instagram-adapter.test.ts test/cli/intake-cli.test.ts`
- **Phase gate:** `bun test`
