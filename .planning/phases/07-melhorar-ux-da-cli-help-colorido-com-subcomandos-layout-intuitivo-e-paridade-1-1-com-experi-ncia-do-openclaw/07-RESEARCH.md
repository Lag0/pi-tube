# Phase 7: CLI UX Overhaul - Research

**Researched:** 2026-03-04
**Domain:** CLI help UX, command discoverability, subcommand ergonomics, and config/setup usability
**Confidence:** HIGH

## Inputs Analyzed

### Project state (`pi-tube`)
- Current CLI is custom-parsed in `src/cli/build-cli.ts`.
- `--help` currently renders one static block regardless of subcommand context.
- `pi-tube config --help` and `pi-tube setup --help` print the same top-level help.
- No dedicated `help` command exists.
- No ANSI color model is applied to help output.

### OpenClaw implementation references (local installed package)
- `openclaw help` and `openclaw config --help` show scoped help output and command hierarchy.
- Command engine is based on Commander (`import { Command } from "commander"`).
- Root program wiring includes:
  - `helpOption("-h, --help", "Display help for command")`
  - `helpCommand("help [command]", "Display help for command")`
  - `configureHelp({ sortSubcommands, sortOptions, optionTerm, subcommandTerm })`
  - `configureOutput(...)` to theme section headers and errors.
- Color and style are centralized through a terminal theme layer (`theme.*`) and honor `--no-color`.

### User-provided benchmark (Playwright-style help)
- Grouped command catalog with short descriptions.
- Clear `Usage` header plus domain sections (`Core`, `Navigation`, `Keyboard`, etc.).
- Minimal noise and high scanability.

## User Constraints

### Locked by user guidance
- CLI help must look materially better and more readable.
- Subcommand help must be first-class (`pi-tube config --help`, `pi-tube setup --help`).
- `pi-tube help` style command must exist.
- Setup must execute workflows (not only print command hints).
- Keep interactive default for humans.
- Keep/add non-interactive mode for AI automation.
- Improve config command UX; current dot-path-only input is considered unintuitive.

### Locked by existing product contract
- Deterministic outputs and stable error handling cannot regress.
- Existing users should not be broken by abrupt command removals.
- `--json` flows remain machine-safe.

### Claude's Discretion
- Specific alias strategy for new config verbs.
- Final visual style (symbols/spacing/colors) as long as it is cleaner and deterministic.
- Backward-compat window for old config shape.

## Recommended Architecture

### Pattern 1: Commander-based command tree
Adopt Commander.js to model root + subcommands + subcommand help natively.

Why:
- Native support for `help [command]` and scoped `--help`.
- Standard option parsing, validation, and error UX.
- Easier long-term command growth than custom positional parser.

### Pattern 2: Shared Help/Theme renderer
Introduce a small `cli/theme.ts` + `cli/help.ts` layer that:
- Defines typography/colors for headings, commands, muted text.
- Applies a deterministic layout for sections and examples.
- Supports `--no-color` and non-TTY fallback.

Why:
- Keeps UX cohesive across root and subcommands.
- Avoids style drift in future command additions.

### Pattern 3: Dual-path config UX (friendly + legacy)
Add intuitive config commands while preserving legacy dot-path compatibility.

Example direction:
- Friendly: `pi-tube config provider set groq`
- Friendly: `pi-tube config provider env groq GROQ_API_KEY`
- Legacy still valid: `pi-tube config set providers.groq.api_key_env GROQ_API_KEY`

Why:
- Improves human UX without breaking scripts.

### Pattern 4: Golden help snapshots
Add snapshot-like tests for root/subcommand help text (including `--no-color`).

Why:
- Prevents accidental regressions in readability and command discoverability.

## Proposed Command UX Direction

- Root:
  - `pi-tube help`
  - `pi-tube --help`
- Subcommands:
  - `pi-tube setup --help`
  - `pi-tube config --help`
  - `pi-tube provider --help` (if provider namespace is introduced)
- Config compatibility:
  - Keep existing `config set|get|list`.
  - Add friendlier aliases and document both.
- Help structure:
  - `Usage`
  - grouped commands (`Core`, `Setup`, `Config`, `Provider`)
  - `Global options`
  - concise examples

## Risks and Mitigations

### Risk 1: Breaking existing automation
- Mitigation: maintain legacy command routes and emit deprecation guidance only (no silent break).

### Risk 2: Help styling breaks deterministic tests
- Mitigation: test normalized no-color output and explicit `--no-color` snapshots.

### Risk 3: Scope creep into full CLI rewrite
- Mitigation: phased plans with explicit wave boundaries and must-have outcomes.

### Risk 4: UX improves but discoverability still weak
- Mitigation: add targeted contract tests for specific user journeys (`help`, `config --help`, setup paths).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `bun:test` |
| Config file | none |
| Quick run command | `bun test test/cli/help.test.ts` |
| Full suite command | `bun test` |

### Requirement Mapping (Phase 7 target)

| Requirement | Behavior to Validate | Test Type | Command |
|-------------|----------------------|-----------|---------|
| CLI-01 | Help and subcommand discoverability improve and remain stable | integration/contract | `bun test test/cli/help.test.ts` |
| CLI-02 | Config UX supports intuitive pathways without breaking existing flow | integration | `bun test test/cli/config-cli.test.ts` |
| CLI-03 | Agent/automation flows remain deterministic (`--json`, non-interactive setup) | integration | `bun test test/cli/setup-cli.test.ts test/cli/output-cli.test.ts` |
| ERR-02 | Invalid command paths still return deterministic non-zero exits | integration | `bun test test/cli/error-exit-codes.test.ts` |

### Sampling Rate
- Per task: run task-level tests from each plan.
- Per wave: run all touched CLI suites.
- Phase gate: run full `bun test` before phase verification.

## Implementation Recommendation

Execute in 4 plans:
1. Command framework + help rendering foundation.
2. Config UX redesign with compatibility layer.
3. Setup flow/help parity and non-interactive automation flags.
4. Contract tests/docs hardening and final UX polish.

This sequencing minimizes breakage risk while delivering immediate UX gains after wave 1.
