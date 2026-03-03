# Quick Task 2 Summary

## Goal
Align `pi-tube setup skills` with the requested UX:
- interactive by default for humans,
- explicit non-interactive mode for AI/automation,
- non-interactive mode enforces global symlink install,
- command executes installer instead of only printing guidance.

## Reference Check (Firecrawl CLI)
Reviewed the official `firecrawl/cli` repository (`HEAD ea965d9`) to confirm setup patterns:
- `firecrawl setup skills` executes `npx skills add firecrawl/cli` directly with inherited stdio.
- Default flow is interactive.
- `--global` is optional on setup.
- Non-interactive behavior is provided in `init` flow via `--yes`/`--all`.

## What Changed
- Updated `setup skills` behavior in `src/cli/setup.ts`:
  - default now stays interactive (no `--yes` unless explicitly requested),
  - added `--non-interactive` mode (`SetupOptions.nonInteractive`) that enforces `--yes --global`,
  - rejects `--agent` with `--non-interactive` to keep deterministic all-agent global install semantics,
  - preserves real command execution via inherited stdio (`Bun.spawnSync` with `stdin/stdout/stderr: inherit`).
- Updated CLI argument parsing/help in `src/cli/build-cli.ts`:
  - replaced `--interactive` with `--non-interactive`.
- Updated help contracts/examples in `src/cli/command-contract.ts`.
- Updated docs in `README.md` to reflect interactive default and automation mode.
- Updated tests:
  - `test/cli/setup-cli.test.ts`
  - `test/cli/help.test.ts`

## Verification
- Focused tests:
  - `bun test test/cli/setup-cli.test.ts` -> pass
  - `bun test test/cli/help.test.ts` -> pass
  - `bun test test/cli/install-flow.test.ts` -> pass
- Full regression:
  - `bun test` -> `119 pass`, `0 fail`
- Runtime execution check (no dry-run, isolated HOME):
  - `HOME=$(mktemp -d) bun run --bun bin/pi-tube.ts setup skills --non-interactive` -> `EXIT:0`
  - Installer output confirmed all-agent symlink/global install path and command completion marker `[SETUP_SKILLS_DONE]`.
