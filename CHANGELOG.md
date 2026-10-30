# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Apache-2.0 license, NOTICE, security policy, contributing guide, code of conduct, issue forms and pull request template.
- Biome for formatting and linting, and a `typecheck` script.
- CI on Linux, macOS and Windows running typecheck, lint, tests and fixture verification.
- `pi-tube providers [--json]` lists each provider with `configured`, `key_source` (`env`, `config` or `none`) and the env var name when the key comes from the environment. `auth`, `config` and `providers` accept `--json`.

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
  | config | 6 | `CONFIG_INVALID`, `CONFIG_IO_FAILED` |
  | unexpected | 1 | `UNEXPECTED` |

- **Breaking:** an error prints two lines, `[CODE] message` and `hint: ...`, instead of one `guidance: ...` line per tip.
- **Breaking:** an API key in the environment now wins over a key stored with `auth login` (it used to be the other way around). `pi-tube providers` shows which one applies, and `auth login` warns when an env var overrides the key it just stored.
- **Breaking:** `auth status` is an alias of `providers` and never prints a key, not even masked. Its header is `[PROVIDERS]` and each line reads `<id> configured=<bool> key_source=<env|config|none> [env_name=<VAR>]`.
- **Breaking:** `config` keeps only `list`, `get <key>` and `set <key> <value>`. API keys are no longer config values (`providers.<id>.api_key` is refused; use `auth login`), and the `config provider ...` and `config language ...` aliases are removed. `defaults` is unchanged.
- **Breaking:** a config file that cannot be parsed fails with `CONFIG_INVALID` (exit 6), and one that cannot be read fails with `CONFIG_IO_FAILED` (exit 6), instead of being silently replaced by defaults. pi-tube never overwrites such a file. Writes are atomic (temp file + rename, mode 600) and keep keys pi-tube does not know.
- **Breaking:** `auth login --key` is removed, so API keys never land in shell history or process lists. In a terminal, `auth login <provider>` asks for the key without echoing it; scripts and agents pipe it with `--stdin` (`printf '%s' "$GROQ_API_KEY" | pi-tube auth login groq --stdin`). Without a terminal and without `--stdin`, it fails at once with `INPUT_INVALID` instead of waiting for input.
- **Breaking:** without `HOME` (the Windows default) pi-tube uses the OS home directory for `~/.pi-tube` instead of `./.pi-tube` in the working directory.

Releases up to 2.2.1 predate this file: see the [npm version history](https://www.npmjs.com/package/@syxs/pi-tube?activeTab=versions) and the git log.
