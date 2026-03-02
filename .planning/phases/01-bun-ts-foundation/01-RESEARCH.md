# Phase 1: Bun/TS Foundation - Research

**Researched:** 2026-03-02
**Domain:** Bun + TypeScript CLI foundation and command-contract migration
**Confidence:** HIGH

## User Constraints

From `.planning/phases/01-bun-ts-foundation/01-CONTEXT.md` (locked decisions):

### Runtime entry + invocation contract
- Canonical invocation is `pi-tube`.
- Phase 1 is considered ready only when `pi-tube` works after one documented install flow on macOS/Linux.
- Contributor/development invocation paths (like `bun run ...`) are supported, but user-facing docs prioritize `pi-tube`.
- If `pi-tube` is unavailable in `PATH`, show a concise remediation message with install command guidance.

### Help information architecture
- Top-level help structure is: Usage -> Commands -> Global options -> Examples -> Notes.
- Include 3-4 high-signal examples in top-level `--help`.
- Future source types (not yet implemented in Phase 1) should be present but clearly labeled as coming soon.
- Help/error tone should be concise, operational, and copy-paste friendly.

### Baseline command surface
- Expose implemented surface as `pi-tube <input>` plus `--help`; other items can appear as clearly labeled placeholders/coming soon.
- Unimplemented commands/options must return deterministic "not implemented yet" behavior with phase-aware guidance.
- Baseline input contract is a single positional input (`pi-tube <input>`).
- Lock core global flags now (`--help`, `--version`, output-mode scaffolding); keep source/provider-specific flags flexible for later phases.

### Claude's Discretion
- Exact wording/format details of install remediation messaging.
- Exact presentation details for placeholder labeling in help output.
- Legacy compatibility shim specifics, as long as command identity and Phase 1 scope constraints above are preserved.

### Deferred Ideas
- None — discussion stayed within phase scope.

## Summary

The safest Phase 1 strategy is to create a thin TypeScript/Bun CLI shell that owns the command contract now (`pi-tube`, `--help`, `--version`, positional input) while intentionally deferring full source/provider behavior to later phases with explicit, deterministic "coming soon"/"not implemented" responses. This preserves contract stability and keeps Phase 1 focused on migration and discoverability, not feature completeness.

To reduce migration risk, retain Python code as reference only and avoid mixed runtime behavior in the primary path. The TypeScript runtime should become the default command entrypoint and include clear fallback guidance when users invoke unsupported legacy pathways. That satisfies MIGR-03 without requiring immediate deletion of Python modules.

For maintainability across upcoming phases, separate CLI surface definition from execution logic. Lock shared flag names and help sections now, then plug source/provider implementations later behind the same command contract. This minimizes future breaking changes and directly supports CLI-01.

**Primary recommendation:** Use Bun + TypeScript + Commander-based CLI shell with a strict contract layer and explicit placeholder behavior for not-yet-implemented operations.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun | 1.x | Runtime, package manager, test runner | Single-tool workflow for TS CLI + fast execution |
| typescript | 5.x | Static typing and compile-time guarantees | Stable CLI contract types across phases |
| commander | 12.x+ | Command/flag/help routing | Mature CLI ergonomics, custom help sections |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 3.x+ | Runtime option/input validation | Parse and validate shared flags/inputs deterministically |
| tsx (optional) | latest | TS execution fallback in non-Bun environments during dev | Only if contributor workflow needs non-Bun execution |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| commander | cac | Smaller API, but less built-in help structure control |
| commander | yargs | Powerful parser but heavier surface and more verbose configuration |
| zod | valibot | Lighter weight, but less common in existing CLI migration patterns |

**Installation:**
```bash
bun add commander zod
bun add -d typescript @types/node
```

## Architecture Patterns

### Recommended Project Structure

```
.
├── bin/
│   └── pi-tube.ts                # Executable entrypoint (shebang)
├── src/
│   ├── cli/
│   │   ├── command-contract.ts   # Stable flags/help contract for v1
│   │   ├── build-cli.ts          # Commander wiring
│   │   └── handlers.ts           # phase-aware placeholder and baseline handlers
│   ├── legacy/
│   │   └── compatibility.ts      # deterministic legacy guidance path
│   ├── errors/
│   │   └── cli-errors.ts         # stable codes/messages for not-implemented cases
│   └── index.ts                  # main bootstrap for programmatic use
├── package.json
├── tsconfig.json
└── README.md
```

### Pattern 1: Contract-First CLI Surface
**What:** Define command names, global flags, and help sections in one module; import that into command wiring and tests.
**When to use:** Any time a future phase will extend CLI behavior but must keep syntax stable.
**Example:**
```typescript
export const GLOBAL_FLAGS = ["--help", "--version", "--json"] as const;
export const HELP_SECTIONS = ["Usage", "Commands", "Global options", "Examples", "Notes"] as const;
```

### Pattern 2: Placeholder Command Handlers with Stable Exit Policy
**What:** Not-yet-implemented paths return deterministic non-zero exits and phase-aware guidance.
**When to use:** Migration phases where command discoverability precedes full implementation.
**Example:**
```typescript
throw new CliPlannedFeatureError("SOURCE_INSTAGRAM_NOT_IMPLEMENTED", "Phase 3");
```

### Pattern 3: Runtime Boundary for Legacy Compatibility
**What:** Keep a clear boundary (`legacy/compatibility.ts`) for old invocation patterns and messaging.
**When to use:** During cutover windows where old docs/aliases may still be used.
**Example:**
```typescript
if (argv[0] === "deepgram" || argv[0] === "groq") {
  return printLegacyGuidanceAndExit();
}
```

### Anti-Patterns to Avoid
- Reusing Python Typer semantics directly in TS without a contract map.
- Mixing actual source-provider business logic into Phase 1 command-routing files.
- Silent no-op placeholders for unimplemented commands (must fail deterministically).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Arg parsing/help rendering | Custom argv parser | Commander | Reduces edge cases and ensures predictable help generation |
| Runtime validation | Ad-hoc `if` chains everywhere | Zod schemas at command boundary | Centralizes input errors and messages |
| Exit/error mapping | Scattered `process.exit(1)` calls | Central CLI error type + mapper | Stable machine-readable behavior across phases |

**Key insight:** Phase 1 is a contract migration milestone; custom parser or scattered error handling increases long-term churn and breaks deterministic UX.

## Common Pitfalls

### Pitfall 1: Help output drifts from locked context decisions
**What goes wrong:** Teams add commands/examples without preserving the agreed section order and labels.
**Why it happens:** Help content is embedded directly in handlers instead of a shared definition.
**How to avoid:** Keep help sections and example set in `command-contract.ts` and snapshot test it.
**Warning signs:** Missing "Notes" section, inconsistent examples across `--help` and README.

### Pitfall 2: Migration leaves Python as hidden dependency
**What goes wrong:** Bun CLI still shells out to Python for baseline paths.
**Why it happens:** Cutover attempts to preserve old behavior by delegating to old entrypoint.
**How to avoid:** Make Bun handlers authoritative for Phase 1 behavior, even for placeholders.
**Warning signs:** Runtime errors mentioning Python/venv in default path.

### Pitfall 3: "Coming soon" paths exit success
**What goes wrong:** Unimplemented commands look successful in scripts.
**Why it happens:** Placeholder handlers print text then return 0.
**How to avoid:** Use dedicated not-implemented error class and non-zero exit consistently.
**Warning signs:** CI scripts passing despite missing implementation.

## Code Examples

Verified migration patterns for this phase:

### Build canonical `pi-tube` command + positional input contract
```typescript
program
  .name("pi-tube")
  .argument("[input]", "media input path or URL")
  .option("--json", "output JSON format (coming soon)")
  .version(version)
  .action(handleBaselineInput);
```

### Deterministic not-implemented behavior
```typescript
if (!isImplemented(commandName)) {
  throw new CliPlannedFeatureError("FEATURE_NOT_IMPLEMENTED", "Available in later phase");
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Python Typer runtime | Bun + TypeScript runtime | v1 migration | Removes Python runtime dependency in primary path |
| Command-specific help text fragments | Central contract-defined help sections | Phase 1 planning | Keeps CLI discoverability deterministic |
| Implicit fallback behavior | Explicit phase-aware error guidance | Phase 1 planning | Better automation and user troubleshooting |

**Deprecated/outdated:**
- Python-first entrypoint for default execution path: replaced by Bun/TS command path in v1.

## Open Questions

1. **Packaging route for `pi-tube` binary in distribution**
   - What we know: Phase 1 requires one documented macOS/Linux install flow with canonical `pi-tube` command.
   - What's unclear: Final publish channel for v1 (npm registry package vs direct git install wrapper).
   - Recommendation: Implement local/package script path first; finalize publish channel in Phase 1 Plan 04 docs task.

2. **How much of legacy subcommand surface should be visible now**
   - What we know: Baseline command is `pi-tube <input>` + help/flags; other items may be placeholders.
   - What's unclear: Exact placeholder command list to expose in top-level command table.
   - Recommendation: Keep placeholder set minimal (only roadmap-near commands) to reduce confusion.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | bun:test (Bun 1.x) |
| Config file | none — Bun default test discovery |
| Quick run command | `bun test test/cli/help.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MIGR-01 | Bun/TS entrypoint runs `pi-tube` command path | integration | `bun test test/cli/entrypoint.test.ts` | ❌ Wave 0 |
| MIGR-02 | Command identity remains `pi-tube` | unit/integration | `bun test test/cli/identity.test.ts` | ❌ Wave 0 |
| MIGR-03 | Python runtime not required in primary path | integration | `bun test test/cli/no-python-runtime.test.ts` | ❌ Wave 0 |
| CLI-01 | `--help` output contains structured sections and examples | unit/snapshot | `bun test test/cli/help.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test test/cli/help.test.ts`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `$gsd-verify-work`
