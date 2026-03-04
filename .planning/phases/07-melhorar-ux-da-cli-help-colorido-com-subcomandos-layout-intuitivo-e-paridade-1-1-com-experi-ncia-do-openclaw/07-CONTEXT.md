# Phase 7: CLI UX Overhaul - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning
**Source:** User directives from quick tasks + follow-up examples (OpenClaw + Playwright-style help)

<domain>
## Phase Boundary

Improve `pi-tube` command UX and help discoverability without regressing deterministic behavior.

In scope:
- Root and subcommand help UX (`pi-tube help`, `pi-tube config --help`, `pi-tube setup --help`).
- Cleaner command grouping and readable output format.
- Colored output by default with `--no-color` escape hatch.
- More intuitive config command paths while preserving machine-friendly determinism.
- Keep setup flows executable (not guidance-only), with interactive human default and non-interactive AI path.

Out of scope:
- New transcription providers.
- New source platforms.
- Non-CLI runtime architecture changes.

</domain>

<decisions>
## Implementation Decisions

### Locked Decisions (from user)
- Help UX must be significantly cleaner and easier to scan than current output.
- Subcommand help must work (example expectation: `pi-tube config --help`).
- There must be a proper help command (`pi-tube help` style behavior).
- Default flow should remain interactive for humans where applicable.
- Non-interactive setup path must exist via flags for AI/automation installs.
- Setup actions should execute commands, not only print command suggestions.
- CLI should take OpenClaw as quality benchmark for discoverability and command ergonomics.
- Help information architecture should move toward grouped sections (example style shared from `playwright-cli`).

### Claude's Discretion
- Exact library choice for command parsing/rendering (likely Commander.js) as long as UX goals are met.
- Exact command aliases/migration strategy for backward compatibility.
- Whether to support both dot-path config (`providers.groq.api_key`) and structured config verbs during transition.
- ANSI styling palette and width/wrapping behavior.

</decisions>

<specifics>
## Specific Ideas

- Introduce command groups in help: `Core`, `Setup`, `Config`, `Output`, `Provider`.
- Add explicit `Global options` section with `--help [command]`, `--version`, `--json`, `--no-color`.
- Adopt short, action-first command descriptions.
- Add examples for most common human flows and AI flows.
- Make config UX readable, e.g. human-friendly aliases around `config set/get/list`.

</specifics>

<deferred>
## Deferred Ideas

- Full TUI for setup/configuration.
- Dynamic shell completion generation.
- Interactive full-screen configuration wizard.

</deferred>

---

*Phase: 07-melhorar-ux-da-cli-help-colorido-com-subcomandos-layout-intuitivo-e-paridade-1-1-com-experi-ncia-do-openclaw*
*Context gathered: 2026-03-04 via direct user guidance*
