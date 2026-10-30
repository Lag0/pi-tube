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
- **Breaking:** an unknown provider in `auth login|logout`, `defaults provider` or `config set defaults.provider` fails with `PROVIDER_INVALID` (v2: `CLI_CONTRACT_VIOLATION`). An unknown `defaults.provider` already stored in the config makes `transcribe` fail with `PROVIDER_INVALID` instead of being ignored; `pi-tube config set defaults.provider <id>` fixes it.
- **Breaking:** `auth status` is an alias of `providers` and never prints a key, not even masked. Its header is `[PROVIDERS]` and each line reads `<id> configured=<bool> key_source=<env|config|none> [env_name=<VAR>]`.
- **Breaking:** `config` keeps only `list`, `get <key>` and `set <key> <value>`. API keys are no longer config values (`providers.<id>.api_key` is refused; use `auth login`), and the `config provider ...` and `config language ...` aliases are removed. `defaults` is unchanged. With `--json`, `get` and `set` print `{"key", "value", "config_path"}` and `list` prints `{"config_path", "values"}` with unset keys as `null`; the `command` and `action` fields are gone.
- **Breaking:** a config file that cannot be parsed fails with `CONFIG_INVALID` (exit 6), and one that cannot be read fails with `CONFIG_IO_FAILED` (exit 6), instead of being silently replaced by defaults. pi-tube never overwrites such a file. Writes are atomic (temp file + rename, mode 600) and keep keys pi-tube does not know. The structure is now checked: `version` must be an integer of at least 1, `defaults`, `providers` and each provider entry must be objects, and known fields must be strings (v2 silently dropped values of the wrong type). A UTF-8 BOM is still accepted. A write replaces a symlinked `config.json` with a regular file, and `~/.pi-tube` is tightened to mode 700 only when pi-tube creates it for the config.
- **Breaking:** `auth login --key` is removed, so API keys never land in shell history or process lists. In a terminal, `auth login <provider>` asks for the key without echoing it; scripts and agents pipe it with `--stdin` (`printf '%s' "$GROQ_API_KEY" | pi-tube auth login groq --stdin`). Without a terminal and without `--stdin`, it fails at once with `INPUT_INVALID`; a key piped without `--stdin`, which v2 read through its prompt, is no longer accepted. The `[AUTH_LOGIN]` line no longer carries `key=<masked>`.
- **Breaking:** without `HOME` (the Windows default) pi-tube uses the OS home directory for `~/.pi-tube` instead of `./.pi-tube` in the working directory.

### Security

- pi-tube no longer loads a `.env` file from the current directory, so running it inside another project does not pick up that project's `.env` secrets or test hooks. The bin runs `bun --no-env-file`, which needs Bun 1.3.3 or newer (`engines.bun` is now `>=1.3.3`). Bun still reads a `bunfig.toml` from the current directory (including `preload` scripts); only run pi-tube in directories you trust until a later release closes that too.
- CI checks out the repository without persisting the GitHub token in the git config.

Releases up to 2.2.1 predate this file: see the [npm version history](https://www.npmjs.com/package/@syxs/pi-tube?activeTab=versions) and the git log.
