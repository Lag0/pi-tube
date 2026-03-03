# Phase 2: Core Source Intake - Research

**Researched:** 2026-03-02
**Domain:** Deterministic source intake for YouTube, direct media URLs, and local files in Bun/TypeScript CLI
**Confidence:** HIGH

## User Constraints

No `02-CONTEXT.md` exists yet for this phase.

Planning constraints are derived from roadmap, requirements, and current project state:

### Locked by roadmap + requirements
- Phase 2 must cover `SRC-01`, `SRC-04`, `SRC-05`, and `SRC-06`.
- Inputs in scope: YouTube URLs, direct downloadable media URLs, and local file paths.
- Non-direct generic URLs must fail early with `UNSUPPORTED_URL_NOT_DIRECT_MEDIA`.
- CLI behavior must remain deterministic and machine-friendly.

### Locked by current codebase trajectory
- Keep Bun + TypeScript as the authoritative runtime path.
- Preserve the canonical CLI identity `pi-tube`.
- Extend the existing contract-first architecture from Phase 1 instead of replacing it.

### Claude's Discretion
- Exact intake module layout under `src/`.
- How strict direct-media validation should be (extension-only vs additional host/path checks).
- Internal normalized source object shape used by downstream phases.

### Deferred for later phases
- Instagram handling (Phase 3).
- Provider abstraction and cloud transcription execution details (Phase 4).
- Output schema expansion and JSON parity (Phase 5).

## Summary

Phase 2 should establish a strict intake boundary: classify one input into a normalized source type (`youtube`, `direct_url`, `local_file`) and return deterministic intake metadata or a deterministic intake failure. The key architecture decision is to separate classification/policy from platform adapters, so YouTube and direct/local logic can evolve independently without churn in CLI routing.

The fastest safe implementation path is: (1) define a typed intake contract and source resolver, (2) implement adapters behind that contract (YouTube via yt-dlp boundary, direct URL validator, local-file normalizer), and (3) wire CLI baseline execution to intake results with regression tests for the supported/unsupported matrix.

This keeps Phase 2 scoped to source intake behavior while preserving a stable handoff point for Phase 4 transcription providers.

**Primary recommendation:** Build a plugin-style intake resolver with deterministic errors and matrix tests, then wire CLI to run intake before provider execution.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun runtime APIs (`Bun.file`, `Bun.spawn`) | Bun 1.3.x | Fast filesystem checks and subprocess execution | Already the project runtime; no extra toolchain |
| TypeScript 5.x | current project | Typed intake contracts and adapter boundaries | Prevents drift across future phases |
| `node:url` URL parser | Node stdlib in Bun | Robust URL normalization and hostname/path parsing | Avoids fragile regex-only URL parsing |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `path` / `node:path` | stdlib | Local file normalization and extension checks | Required for SRC-06 deterministic handling |
| `youtube-dl-exec` (optional) | latest stable if adopted | Typed wrapper around `yt-dlp` invocation | Use only if plain `Bun.spawn` wrapper becomes repetitive |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Bun.spawn(["yt-dlp", ...])` | bundled TS YouTube extraction lib | Extra dependency churn and weaker parity with existing Python behavior |
| Extension-based direct URL policy | HEAD/content-type validation | More accurate but slower and more failure-prone in CI/offline tests |
| Single monolithic resolver file | adapter modules per source | Monolith is quicker initially but harder to test and extend |

**Installation (only if wrapper lib is chosen):**
```bash
bun add youtube-dl-exec
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── intake/
│   ├── types.ts                    # Normalized source contracts
│   ├── resolver.ts                 # classify + dispatch
│   ├── policy.ts                   # URL/local policy checks
│   └── adapters/
│       ├── youtube.ts              # yt-dlp metadata/media extraction boundary
│       ├── direct-url.ts           # direct media URL validation + normalization
│       └── local-file.ts           # local file normalization + validation
├── errors/
│   └── cli-errors.ts               # deterministic public error codes
└── cli/
    └── handlers.ts                 # baseline input handler calls resolver
```

### Pattern 1: Contract-First Intake Resolver
**What:** Define one `ResolvedSource` union type and make all adapters return that contract.
**When to use:** Always, before adding adapter logic.
**Example:**
```typescript
export type ResolvedSource =
  | { kind: "youtube"; originalInput: string; mediaUrl: string; title?: string }
  | { kind: "direct_url"; originalInput: string; mediaUrl: string; extension: string }
  | { kind: "local_file"; originalInput: string; absolutePath: string; extension: string };
```

### Pattern 2: Policy Gate Before Adapter Work
**What:** Reject unsupported URLs before network/download work.
**When to use:** For `SRC-05` and fast-fail behavior.
**Example:**
```typescript
if (isHttpUrl(input) && !isYouTubeUrl(input) && !isDirectMediaUrl(input)) {
  throw new CliError("Input URL is not a direct media URL.", {
    code: "UNSUPPORTED_URL_NOT_DIRECT_MEDIA",
    exitCode: 2,
  });
}
```

### Pattern 3: Adapter Boundary Returns Metadata, Not CLI Output
**What:** Adapters return data objects; CLI decides final messaging/output.
**When to use:** Keeps providers/output phases decoupled from intake internals.
**Example:**
```typescript
const source = await resolveSource(input);
return { source, readyForTranscription: true };
```

### Anti-Patterns to Avoid
- Mixing source classification, download logic, and CLI message formatting in one function.
- Accepting arbitrary webpage URLs and attempting best-effort scraping in Phase 2.
- Silent fallback behavior that hides unsupported URL policy violations.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YouTube media extraction | custom YouTube parser/scraper | `yt-dlp` boundary | Platform changes are frequent; yt-dlp is purpose-built |
| URL parsing | complex regex-only parser | `new URL()` + focused checks | More robust hostname/path handling |
| MIME capability database | giant custom table | extension allowlist for v1 core formats | Faster, deterministic, aligned with requirement scope |

**Key insight:** Keep platform complexity in adapters and keep resolver/policy deterministic.

## Common Pitfalls

### Pitfall 1: Treating any `https://` URL as transcribable
**What goes wrong:** Generic pages pass validation and fail later in confusing ways.
**Why it happens:** Missing explicit direct-media policy gate.
**How to avoid:** Enforce `UNSUPPORTED_URL_NOT_DIRECT_MEDIA` before any download/transcribe step.
**Warning signs:** Intake accepts news/article URLs or home pages.

### Pitfall 2: Tight coupling between CLI handler and adapter internals
**What goes wrong:** Small adapter changes require CLI rewrites.
**Why it happens:** Handler reads adapter-specific fields directly.
**How to avoid:** Keep one normalized `ResolvedSource` contract.
**Warning signs:** `if/else` chains in handler based on adapter internals.

### Pitfall 3: Non-deterministic local file behavior
**What goes wrong:** Relative paths and symlinks produce inconsistent outputs in tests.
**Why it happens:** Paths are not normalized early.
**How to avoid:** Resolve to absolute path and validate extension/existence in one function.
**Warning signs:** Tests pass locally but fail in CI due to cwd/path differences.

## Code Examples

Verified patterns for this phase:

### Deterministic URL classifier
```typescript
export function classifyInput(input: string): "youtube" | "direct_url" | "local_file" | "unsupported_url" {
  if (isYouTubeUrl(input)) return "youtube";
  if (isHttpUrl(input) && isDirectMediaUrl(input)) return "direct_url";
  if (isHttpUrl(input)) return "unsupported_url";
  return "local_file";
}
```

### Bun subprocess boundary for yt-dlp
```typescript
const proc = Bun.spawn(["yt-dlp", "--dump-json", input], {
  stdout: "pipe",
  stderr: "pipe",
});
const exitCode = await proc.exited;
if (exitCode !== 0) {
  throw new CliError("Failed to resolve YouTube media.", {
    code: "YOUTUBE_EXTRACT_FAILED",
    exitCode: 2,
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Python-only intake branch in `pi_tube/cli.py` | Bun/TS contract-first CLI with deferred source execution | Phase 1 | Requires TypeScript-native intake layer in Phase 2 |
| Placeholder-only baseline input handling | Real source resolver + deterministic policy errors | Phase 2 target | Enables source-specific behavior before provider expansion |
| Mixed validation/output logic | Typed resolver + adapter boundaries | Phase 2 target | Easier incremental evolution in Phases 3-5 |

**Deprecated/outdated:**
- Treating baseline input path as purely placeholder-only in TS: Phase 2 needs real intake.

## Open Questions

1. **How strict should direct-media URL validation be in v1?**
   - What we know: Requirement explicitly targets deterministic direct-media URLs.
   - What's unclear: Whether extension-only is enough for initial release.
   - Recommendation: Start with extension allowlist and explicit unsupported error; expand with optional HEAD validation only if needed.

2. **Should Phase 2 persist downloaded media or only normalize intake metadata?**
   - What we know: Phase 4 will own provider execution abstraction.
   - What's unclear: Preferred artifact handoff between intake and provider layers.
   - Recommendation: Return normalized source contract now; keep persistent download decisions in adapter-level options.

3. **How to handle missing `yt-dlp` binary on user machines?**
   - What we know: Existing Python flow assumes yt-dlp availability.
   - What's unclear: Whether installer should provision yt-dlp in v1.
   - Recommendation: Add explicit preflight failure code (`YTDLP_NOT_FOUND`) in Phase 2 and document remediation.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `bun:test` |
| Config file | none (Bun default discovery) |
| Quick run command | `bun test test/intake/source-resolver.test.ts test/intake/intake-matrix.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SRC-01 | YouTube URL resolves through intake adapter boundary | integration | `bun test test/intake/youtube-adapter.test.ts` | ❌ Wave 0 |
| SRC-04 | Direct media URL is accepted and normalized | unit/integration | `bun test test/intake/direct-url-adapter.test.ts` | ❌ Wave 0 |
| SRC-05 | Non-direct URL fails with `UNSUPPORTED_URL_NOT_DIRECT_MEDIA` | unit | `bun test test/intake/source-resolver.test.ts` | ❌ Wave 0 |
| SRC-06 | Local file path is accepted and normalized | unit/integration | `bun test test/intake/local-file-adapter.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test test/intake/source-resolver.test.ts`
- **Per wave merge:** `bun test test/intake/*.test.ts`
- **Phase gate:** Full suite green before `$gsd-verify-work`
