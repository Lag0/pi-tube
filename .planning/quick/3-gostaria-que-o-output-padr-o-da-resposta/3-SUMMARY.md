# Quick Task 3 Summary

## Goal
Change baseline CLI output behavior so results are written to `~/.pi-tube/YYYY-MM-DD-<title-or-file>` and terminal stdout prints a clickable file link.

## What Changed
- Added output persistence module: `src/output/persist.ts`
  - Writes artifacts to `~/.pi-tube` by default.
  - Uses filename pattern `YYYY-MM-DD-<title-or-file>.md|json`.
  - Sanitizes labels and adds numeric suffix when a file already exists.
  - Emits both filesystem path and file URI.
- Added baseline persistence flow:
  - `src/cli/handlers.ts`: new `persistBaselineIntakeResult(...)`.
  - `src/cli/build-cli.ts`: baseline command now writes output file and prints:
    - `[OUTPUT_FILE] /absolute/path`
    - `[OUTPUT_FILE_URI] file:///absolute/path`
- Updated CLI docs/help:
  - `src/cli/command-contract.ts`
  - `README.md`
- Updated CLI tests to read generated files from `[OUTPUT_FILE]` instead of stdout body.
  - Added helper: `test/cli/output-file.ts`
  - Updated: `test/cli/output-cli.test.ts`, `test/cli/transcription-cli.test.ts`, `test/cli/intake-cli.test.ts`, `test/cli/config-cli.test.ts`

## Verification
- Focused tests passed:
  - `bun test test/cli/output-cli.test.ts`
  - `bun test test/cli/transcription-cli.test.ts`
  - `bun test test/cli/intake-cli.test.ts`
  - `bun test test/cli/config-cli.test.ts`
- Full suite passed:
  - `bun test` => `118 pass`, `0 fail`
- Runtime validation (with mocked provider):
  - Command prints `[OUTPUT_FILE]` and `[OUTPUT_FILE_URI]`.
  - File written at `~/.pi-tube/2026-03-04-demo-2.md`.
