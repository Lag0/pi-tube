# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Apache-2.0 license, NOTICE, security policy, contributing guide, code of conduct, issue forms and pull request template.
- Biome for formatting and linting, and a `typecheck` script.
- CI on Linux, macOS and Windows running typecheck, lint, tests and fixture verification.

### Changed

- Dependencies are pinned to exact versions.
- yt-dlp child processes no longer inherit stdin.
- **Breaking:** error codes are renamed so the CLI and the upcoming MCP server share them: `CLI_CONTRACT_VIOLATION` → `INPUT_INVALID`, `CLI_NOT_IMPLEMENTED` → `NOT_IMPLEMENTED`, `CLI_UNEXPECTED` → `UNEXPECTED`, and `TRANSCRIPTION_PROVIDER_*` → `PROVIDER_*`. `INTAKE_CLASSIFICATION_FAILED` and `YOUTUBE_URL_INVALID`, which could never be raised, are removed.
- **Breaking:** the exit code now depends on the error category instead of always being 2:

  | Category | Exit code | Codes |
  |---|---|---|
  | usage | 2 | `INPUT_INVALID`, `NOT_IMPLEMENTED`, `PROVIDER_INVALID` |
  | dependency | 3 | `SETUP_COMMAND_FAILED`, `YTDLP_NOT_FOUND`, `YTDLP_OUTPUT_INVALID` |
  | provider | 4 | `PROVIDER_NOT_CONFIGURED`, `PROVIDER_AUTH`, `PROVIDER_RATE_LIMIT`, `PROVIDER_UNAVAILABLE`, `PROVIDER_FAILED`, `PROVIDER_INVALID_RESPONSE` |
  | source | 5 | `UNSUPPORTED_URL_NOT_DIRECT_MEDIA`, `YOUTUBE_EXTRACT_FAILED`, `INSTAGRAM_*`, `LOCAL_FILE_*`, `DOWNLOAD_FAILED` |
  | unexpected | 1 | `UNEXPECTED` |

- **Breaking:** an error prints two lines, `[CODE] message` and `hint: ...`, instead of one `guidance: ...` line per tip.

Releases up to 2.2.1 predate this file: see the [npm version history](https://www.npmjs.com/package/@syxs/pi-tube?activeTab=versions) and the git log.
