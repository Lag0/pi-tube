# Phase 1: Bun/TS Foundation - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the primary TypeScript + Bun runtime path for `pi-tube`, keep command identity unchanged, provide baseline CLI discoverability via `--help`, and remove Python runtime dependency from the main v1 command path.

</domain>

<decisions>
## Implementation Decisions

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

</decisions>

<specifics>
## Specific Ideas

- Messaging should be operational and easy to execute directly from terminal output.
- Help content should guide quickly via practical examples, not long prose.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-bun-ts-foundation*
*Context gathered: 2026-03-02*
