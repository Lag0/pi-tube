# Download Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable media download module and expose it as `pi-tube download <url>` for YouTube and Instagram, downloading video+audio by default and audio-only with `--audio`.

**Architecture:** Add a focused `src/download/` module that owns durable media downloads via `yt-dlp`, separate from temporary transcription downloads. Wire a new Commander-routed `download` CLI path in `src/cli/build-cli.ts` and keep output deterministic with `[DOWNLOAD_FILE]` and `[DOWNLOAD_FILE_URI]` markers.

**Tech Stack:** Bun, TypeScript ESM, Commander, Vitest, yt-dlp.

---

## Files and Responsibilities

- Create `src/download/types.ts`: public download option/result types.
- Create `src/download/service.ts`: download command construction, output-dir handling, subprocess execution, stdout parsing, error mapping.
- Modify `src/cli/handlers.ts`: add `handleDownloadCommand` CLI-facing handler.
- Modify `src/cli/build-cli.ts`: route `download <url>` with `--audio` and `--output <dir>`.
- Modify `src/cli/command-contract.ts`: document command/help examples.
- Modify `src/errors/catalog.ts` and `src/errors/cli-errors.ts`: add deterministic download failure error if existing errors are not enough.
- Create `test/download/download-service.test.ts`: module-level tests with mocked executor.
- Create or modify `test/cli/download-cli.test.ts`: CLI integration tests using env-based mock output.
- Modify `README.md`: document download command.

---

### Task 1: Add Download Service Types and Core Service

**Files:**
- Create: `src/download/types.ts`
- Create: `src/download/service.ts`
- Test: `test/download/download-service.test.ts`

- [ ] Write failing tests for video default, audio mode, output dir, missing filepath, and Instagram auth mapping.
- [ ] Implement `downloadMedia(input, options)` with injectable executor.
- [ ] Ensure output dir defaults to `./downloads` resolved against cwd.
- [ ] Ensure `yt-dlp` args use video default and audio-only flag mode.
- [ ] Run `bun run test -- test/download/download-service.test.ts`.
- [ ] Commit: `feat: add reusable download service`.

### Task 2: Add CLI Download Command

**Files:**
- Modify: `src/cli/handlers.ts`
- Modify: `src/cli/build-cli.ts`
- Test: `test/cli/download-cli.test.ts`

- [ ] Write failing CLI tests for `download <url>`, `download <url> --audio`, `download <url> --output ./custom`, and command validation.
- [ ] Add `DownloadCommandInput` and `handleDownloadCommand` in handlers.
- [ ] Route `download` in Commander parsing while rejecting transcription-only flags (`--provider`, `--language`, `--timestamps`) for this command.
- [ ] Print `[DOWNLOAD_FILE]` and `[DOWNLOAD_FILE_URI]` on success.
- [ ] Run CLI download tests.
- [ ] Commit: `feat: expose media download command`.

### Task 3: Update Help, Docs, and Error Contract

**Files:**
- Modify: `src/cli/command-contract.ts`
- Modify: `README.md`
- Modify: `src/errors/catalog.ts`
- Modify: `src/errors/cli-errors.ts`
- Modify: relevant tests

- [ ] Add help entries/examples for `pi-tube download <url> [--audio] [--output <dir>]`.
- [ ] Add README download section.
- [ ] Add deterministic error code if needed: `DOWNLOAD_FAILED`.
- [ ] Update tests that assert help sections.
- [ ] Commit: `docs: document download command`.

### Task 4: Final Verification

- [ ] Run `bun run test`.
- [ ] Run `bun run verify:fixtures`.
- [ ] Run `bun run pi-tube --help`.
- [ ] Run mocked CLI smoke if env mock is added.
- [ ] Run `git status --short`.
- [ ] Push branch and open PR targeting `main`.

---

## Self-Review

- Scope is limited to durable downloads for YouTube/Instagram URLs.
- No tsup/build changes.
- Transcription behavior remains unchanged.
- The temporary transcription download helper is not reused directly because it has cleanup semantics; shared helpers may be extracted only if they stay small and deterministic.
