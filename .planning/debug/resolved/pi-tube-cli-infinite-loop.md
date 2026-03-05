---
status: resolved
trigger: "Investigate issue: pi-tube-cli-infinite-loop"
created: 2026-03-04T23:45:17Z
updated: 2026-03-04T23:58:52Z
---

## Current Focus

hypothesis: Root cause fix is complete and now confirmed by user in real global CLI workflow.
test: Checkpoint response reports both timeout-path and happy-path behavior after global reinstall.
expecting: Session can be archived and completed without further investigation.
next_action: archive debug file and finalize commits for code + docs

## Symptoms

expected: Should transcribe the YouTube video and save artifact, then exit.
actual: Command appears to run forever/hangs when executed from global CLI.
errors: No explicit error output reported.
reproduction: Run `pi-tube "https://www.youtube.com/watch?v=m_I8J0U-BIY"` from globally installed CLI.
started: Regression; reportedly worked before.

## Eliminated

- hypothesis: Global `pi-tube 1.0.1` always hangs on the reported YouTube URL.
  evidence: Command exits successfully in ~15s and prints deterministic output artifact path with exit code 0.
  timestamp: 2026-03-04T23:47:00Z

## Evidence

- timestamp: 2026-03-04T23:45:17Z
  checked: global command resolution
  found: `pi-tube` resolves to `/Users/brunolago/.nvm/versions/node/v22.13.0/bin/pi-tube` and reports version `1.0.1`
  implication: Reproduction should target the globally installed package path and behavior.

- timestamp: 2026-03-04T23:45:17Z
  checked: repository layout
  found: CLI entrypoints and intake/transcription modules are present under `bin/` and `src/`
  implication: We can compare global execution path with local source entrypoints to isolate regression.

- timestamp: 2026-03-04T23:46:10Z
  checked: local `pi-tube` skill instructions
  found: expected runtime flow is `pi-tube <input>` producing artifact and terminating
  implication: The reported infinite run contradicts intended deterministic CLI behavior.

- timestamp: 2026-03-04T23:46:10Z
  checked: global CLI wrapper script
  found: wrapper is minimal and calls `main(process.argv.slice(2))` from `src/index.ts`
  implication: root cause is likely in CLI/main implementation path rather than global shim itself.

- timestamp: 2026-03-04T23:47:00Z
  checked: reported reproduction command with 90s runtime cap
  found: process exited before timeout with exit code 0 and emitted `[OUTPUT_FILE]` + `[OUTPUT_FILE_URI]`
  implication: issue does not reproduce in current configured environment; likely tied to specific state/config path.

- timestamp: 2026-03-04T23:47:55Z
  checked: reproduction with isolated fresh `HOME`
  found: process exits quickly (code 2) with explicit `[TRANSCRIPTION_PROVIDER_AUTH]` missing `DEEPGRAM_API_KEY`
  implication: missing config/credentials path fails fast and does not produce infinite loop in current build.

- timestamp: 2026-03-04T23:48:42Z
  checked: global install linkage
  found: `/Users/brunolago/.nvm/versions/node/v22.13.0/bin/pi-tube` is a symlink to `../lib/node_modules/@syxs/pi-tube/bin/pi-tube`
  implication: actual runtime source is the global package under `lib/node_modules/@syxs/pi-tube`.

- timestamp: 2026-03-04T23:48:42Z
  checked: local package metadata
  found: package version is `1.0.1`, bin target is `bin/pi-tube`, published files include `src`
  implication: global package may execute TypeScript source directly; behavior depends on shipped runtime code.

- timestamp: 2026-03-04T23:49:42Z
  checked: global package source vs workspace source
  found: `diff -ru` between global `src/` and workspace `src/` shows no differences
  implication: current global install is code-equivalent to workspace; root cause is likely runtime conditions, not stale code drift.

- timestamp: 2026-03-04T23:50:58Z
  checked: core execution path (`runCli` -> `handleBaselineInput` -> `resolveSource` -> `resolveYouTubeWithYtDlp` -> provider transcribe)
  found: yt-dlp execution uses `Bun.spawn` and awaits `process.exited` without timeout; transcription calls await provider SDK methods directly
  implication: external subprocess/API stalls can keep process alive indefinitely because no deadline exists.

- timestamp: 2026-03-04T23:52:10Z
  checked: provider media-preparation path
  found: `downloadMediaForTranscription` also uses `Bun.spawn` + `await child.exited` without timeout when downloading YouTube/Instagram media for providers
  implication: there are two independent unbounded yt-dlp subprocess points that can produce perceived infinite execution.

- timestamp: 2026-03-04T23:53:22Z
  checked: controlled hang experiment with PATH shim (`yt-dlp` script that sleeps indefinitely)
  found: `pi-tube <youtube-url>` remained running beyond 30 seconds with no output until externally terminated
  implication: missing yt-dlp timeout is a reproducible mechanism for the reported "executes forever" symptom.

- timestamp: 2026-03-04T23:55:58Z
  checked: code fix implementation
  found: added `PI_TUBE_YTDLP_TIMEOUT_MS`-based timeout guards for yt-dlp extraction and provider media download subprocesses
  implication: stalled yt-dlp invocations now fail fast instead of blocking CLI indefinitely.

- timestamp: 2026-03-04T23:55:58Z
  checked: regression tests
  found: added tests for hanging yt-dlp in intake resolver and deepgram provider download flow
  implication: timeout behavior is now covered against regressions in both affected paths.

- timestamp: 2026-03-04T23:56:33Z
  checked: focused test execution
  found: `bun test test/intake/youtube-adapter.test.ts test/transcription/deepgram-provider.test.ts` passed (15/15)
  implication: fix compiles and timeout behavior is validated in automated tests.

- timestamp: 2026-03-04T23:57:10Z
  checked: controlled hang repro against updated local CLI entrypoint
  found: with mocked hanging `yt-dlp` and `PI_TUBE_YTDLP_TIMEOUT_MS=20`, command exits immediately with `[YOUTUBE_EXTRACT_FAILED] ... timed out`
  implication: CLI no longer hangs indefinitely when yt-dlp stalls.

- timestamp: 2026-03-04T23:57:27Z
  checked: normal YouTube run after fix
  found: `bun run --bun bin/pi-tube.ts <url>` completes successfully and emits `[OUTPUT_FILE]`
  implication: timeout guard does not regress happy-path transcription.

- timestamp: 2026-03-05T00:00:20Z
  checked: checkpoint response from user
  found: user has not run verification yet and asked for quick concrete global-CLI validation steps
  implication: remain in `awaiting_human_verify` and provide explicit command sequence for user-run confirmation.

- timestamp: 2026-03-05T00:05:30Z
  checked: deterministic hang test against currently installed global `pi-tube`
  found: command remained stuck with `yt-dlp` sleep shim; global package source check showed timeout token absent (`PI_TUBE_YTDLP_TIMEOUT_MS` not found)
  implication: global install is pre-fix and must be reinstalled before user can validate no-hang behavior.

- timestamp: 2026-03-05T00:07:25Z
  checked: global reinstall from current worktree
  found: `npm i -g .` completed; global source now contains `PI_TUBE_YTDLP_TIMEOUT_MS`
  implication: global executable now includes timeout fix.

- timestamp: 2026-03-05T00:07:25Z
  checked: deterministic hang test on updated global CLI
  found: with hanging `yt-dlp` shim and `PI_TUBE_YTDLP_TIMEOUT_MS=20`, command exits immediately with `[YOUTUBE_EXTRACT_FAILED] ... timed out` (exit code 2)
  implication: infinite-loop condition is fixed for global CLI when yt-dlp stalls.

- timestamp: 2026-03-05T00:07:25Z
  checked: normal global transcription command
  found: `pi-tube <youtube-url>` completed in ~13s and emitted `[OUTPUT_FILE]`
  implication: fix does not regress normal end-to-end global workflow.

## Resolution

root_cause: `yt-dlp` subprocesses in both URL extraction (`src/intake/tools/yt-dlp.ts`) and provider media download (`src/transcription/providers/media-input.ts`) were awaited without any timeout; when yt-dlp stalled, CLI execution blocked forever.
fix: Added timeout-based termination for yt-dlp subprocesses in source-resolution and provider-download paths, with deterministic failure propagation and regression tests.
verification: Focused tests pass (15/15); after reinstalling global package, controlled hanging yt-dlp exits immediately with timeout error and normal global YouTube transcription still succeeds; user confirmed the same behavior end-to-end on global CLI.
files_changed:
  - src/intake/tools/yt-dlp.ts
  - src/transcription/providers/media-input.ts
  - test/intake/youtube-adapter.test.ts
  - test/transcription/deepgram-provider.test.ts
