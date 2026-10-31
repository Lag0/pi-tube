# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Apache-2.0 license, NOTICE, security policy, contributing guide, code of conduct, issue forms and pull request template.
- Biome for formatting and linting, and a `typecheck` script.
- CI on Linux, macOS and Windows running typecheck, lint, tests and fixture verification.
- Provider requests time out after 10 minutes and can be cancelled. yt-dlp runs get 2 minutes for metadata and 30 minutes for downloads (`PI_TUBE_YTDLP_TIMEOUT_MS`, a positive whole number of milliseconds capped at 2147483647, overrides both; other values such as `30s` keep the defaults), stop with their whole process tree, receive `--` before the URL, and see only an allowlisted environment (no provider keys). Transcripts are saved with mode 600 and never overwrite an existing file, and directories pi-tube creates for transcripts, temp audio and downloads are mode 700; an unwritable transcripts directory is caught before the provider is called; a save that fails is `STORAGE_IO_FAILED` (exit 6) instead of `UNEXPECTED`.
- `transcribe` and `download` accept any page yt-dlp supports. YouTube, Instagram, direct media URLs and local files are the `tested` tier; any other site is `best_effort`.
- Saved transcripts (schema 1.2.0) keep the source's tier and, for pages, the platform (yt-dlp extractor), media id, canonical URL, duration, live status and chapters. Each timestamped segment names its chapter, and dense segments are never merged across a chapter boundary. The Markdown lists the chapters under "Source Metadata" and, with `--timestamps`, puts a `####` heading before each chapter's first segment. `transcribe --json` adds `source.platform` and `source.tier`.
- A live stream that is still running, is scheduled, or whose recording YouTube is still processing (`live_status` `is_live`, `is_upcoming` or `post_live`) fails `transcribe` and `download` with `SOURCE_LIVE_NOT_ENDED` (exit 5) before anything is downloaded or sent to a provider. A finished stream (`was_live`) works as before.
- Source settings in the config, read on every `transcribe` and `download`:
  - `network.allow_private_hosts` (default `false`): set it to `true` to let pi-tube reach private, loopback and link-local hosts;
  - `cookies.file`: a cookies.txt (Netscape format) for sites that need a login; `PI_TUBE_COOKIES_FILE` wins over it;
  - `local_files.max_bytes` (default 1073741824, at most 2147483647): the largest local file pi-tube accepts.

  Cookie paths must be absolute; a relative one fails with `COOKIES_FILE_INVALID` (exit 6). `pi-tube config set` takes `true`/`false` and whole numbers for these keys, and `config get|list --json` print them as JSON booleans and numbers.
- `pi-tube providers [--json]` lists each provider with `configured`, `key_source` (`env`, `config` or `none`) and the env var name when the key comes from the environment. `auth`, `config` and `providers` accept `--json`.

### Changed

- Dependencies are pinned to exact versions.
- yt-dlp child processes no longer inherit stdin.
- Ctrl-C, SIGTERM or a closed terminal (SIGHUP) during `transcribe` or `download` cancels the operation: yt-dlp and its children are stopped, temporary audio is removed, nothing partial is saved, and pi-tube exits with 130 (`[CANCELLED]`). A second Ctrl-C kills pi-tube at once.
- **Breaking:** error codes are renamed so the CLI and the upcoming MCP server share them: `CLI_CONTRACT_VIOLATION` → `INPUT_INVALID`, `CLI_NOT_IMPLEMENTED` → `NOT_IMPLEMENTED`, `CLI_UNEXPECTED` → `UNEXPECTED`, and `TRANSCRIPTION_PROVIDER_*` → `PROVIDER_*`. `INTAKE_CLASSIFICATION_FAILED` and `YOUTUBE_URL_INVALID`, which could never be raised, are removed.
- **Breaking:** the exit code now depends on the error category instead of always being 2:

  | Category | Exit code | Codes |
  |---|---|---|
  | usage | 2 | `INPUT_INVALID`, `NOT_IMPLEMENTED`, `PROVIDER_INVALID` |
  | dependency | 3 | `SETUP_COMMAND_FAILED`, `YTDLP_NOT_FOUND`, `YTDLP_OUTPUT_INVALID` |
  | provider | 4 | `PROVIDER_NOT_CONFIGURED`, `PROVIDER_AUTH`, `PROVIDER_RATE_LIMIT`, `PROVIDER_UNAVAILABLE`, `PROVIDER_FAILED`, `PROVIDER_INVALID_RESPONSE` |
  | source | 5 | `SOURCE_UNSUPPORTED`, `SOURCE_EXTRACT_FAILED`, `SOURCE_LIVE_NOT_ENDED`, `SOURCE_HOST_BLOCKED`, `YOUTUBE_EXTRACT_FAILED`, `INSTAGRAM_*`, `LOCAL_FILE_*`, `DOWNLOAD_FAILED` |
  | config | 6 | `CONFIG_INVALID`, `CONFIG_IO_FAILED`, `STORAGE_IO_FAILED`, `COOKIES_FILE_INVALID` |
  | cancelled | 130 | `CANCELLED` |
  | unexpected | 1 | `UNEXPECTED` |

- **Breaking:** an error prints two lines, `[CODE] message` and `hint: ...`, instead of one `guidance: ...` line per tip.
- **Breaking:** an API key in the environment now wins over a key stored with `auth login` (it used to be the other way around). `pi-tube providers` shows which one applies, and `auth login` warns when an env var overrides the key it just stored.
- **Breaking:** an unknown provider in `auth login|logout`, `defaults provider` or `config set defaults.provider` fails with `PROVIDER_INVALID` (v2: `CLI_CONTRACT_VIOLATION`). An unknown `defaults.provider` already stored in the config makes `transcribe` fail with `PROVIDER_INVALID` instead of being ignored; `pi-tube config set defaults.provider <id>` fixes it.
- **Breaking:** `auth status` is an alias of `providers` and never prints a key, not even masked. Its header is `[PROVIDERS]` and each line reads `<id> configured=<bool> key_source=<env|config|none> [env_name=<VAR>]`.
- **Breaking:** `config` keeps only `list`, `get <key>` and `set <key> <value>`. API keys are no longer config values (`providers.<id>.api_key` is refused; use `auth login`), and the `config provider ...` and `config language ...` aliases are removed. `defaults` is unchanged. With `--json`, `get` and `set` print `{"key", "value", "config_path"}` and `list` prints `{"config_path", "values"}` with unset keys as `null`; the `command` and `action` fields are gone.
- **Breaking:** a config file that cannot be parsed fails with `CONFIG_INVALID` (exit 6), and one that cannot be read fails with `CONFIG_IO_FAILED` (exit 6), instead of being silently replaced by defaults. pi-tube never overwrites such a file. Writes are atomic (temp file + rename, mode 600) and keep keys pi-tube does not know. The structure is now checked: `version` must be an integer of at least 1, `defaults`, `providers` and each provider entry must be objects, and known fields must be strings (v2 silently dropped values of the wrong type). A UTF-8 BOM is still accepted. A write replaces a symlinked `config.json` with a regular file, and `~/.pi-tube` is tightened to mode 700 only when pi-tube creates it for the config.
- **Breaking:** `auth login --key` is removed, so API keys never land in shell history or process lists. In a terminal, `auth login <provider>` asks for the key without echoing it; scripts and agents pipe it with `--stdin` (`printf '%s' "$GROQ_API_KEY" | pi-tube auth login groq --stdin`). Without a terminal and without `--stdin`, it fails at once with `INPUT_INVALID`; a key piped without `--stdin`, which v2 read through its prompt, is no longer accepted. The `[AUTH_LOGIN]` line no longer carries `key=<masked>`.
- **Breaking:** `transcribe` never switches providers on its own. It uses `--provider`, then `PI_TUBE_TRANSCRIPTION_PROVIDER`, then `defaults.provider`, then the first configured provider (deepgram, groq, elevenlabs). A chosen provider without a key fails with `PROVIDER_NOT_CONFIGURED`, and a rate limit or outage fails with a hint naming the other configured providers. The language follows the same order (`--language`, `PI_TUBE_TRANSCRIPTION_LANGUAGE`, `defaults.language`). Both env vars now win over the config defaults, where the config used to win. The provider is chosen before the input is resolved, so with no provider configured any input reports `PROVIDER_NOT_CONFIGURED` first.
- **Breaking:** `transcribe --json` prints the result on stdout as one JSON object (`output_path`, `output_uri`, `format`, `provider`, `source`, `requested_language`, `detected_language`, `summary`, `characters`, `segments`) instead of the `[OUTPUT_FILE]` lines; the saved file is still JSON. The full text stays in the file.
- **Breaking:** a failed audio download during `transcribe` is `DOWNLOAD_FAILED` (exit 5) instead of `PROVIDER_FAILED`, and an Instagram failure no longer reports a YouTube error code. One table maps provider errors for every provider: 401/403 `PROVIDER_AUTH`, 429 `PROVIDER_RATE_LIMIT`, 408, 5xx or no status `PROVIDER_UNAVAILABLE` (some of these were `PROVIDER_FAILED`), any other 4xx `PROVIDER_FAILED` (Groq and ElevenLabs used to report 400/422 as `PROVIDER_INVALID_RESPONSE`). `YTDLP_NOT_FOUND` now means only that the yt-dlp binary is missing; v2 also used it for any yt-dlp error that said "not found".
- **Breaking:** `download` saves into `~/.pi-tube/downloads` by default instead of `./downloads` in the current directory; `--output` still picks another directory. `download --json` prints `{"output_path", "output_uri", "source_kind", "media"}`. While a download runs, yt-dlp keeps its partial files in a hidden `.pi-tube-tmp-*` directory inside the output directory, removed when the run ends, so a failed or cancelled download leaves no `.part` files behind (a second Ctrl-C, which kills pi-tube at once, can leave that directory behind).
- **Breaking:** the `INSTAGRAM_URL_INVALID` code is removed: a non-public Instagram URL is not recognized as Instagram, so yt-dlp reads it as a best-effort site, like any other page URL.
- **Breaking:** saved transcripts no longer store signed or expiring media URLs. For YouTube and Instagram, `media_url` is gone (`null` in JSON) and the Markdown `source_reference` is the page URL; for a direct media URL, the query string and fragment are dropped from `original_input`, `normalized_url` and `media_url`.
- **Breaking:** `UNSUPPORTED_URL_NOT_DIRECT_MEDIA` is replaced by `SOURCE_UNSUPPORTED`, which pi-tube reports only when yt-dlp cannot read the page (or the URL is a playlist or channel). A best-effort site that yt-dlp fails to read is the new `SOURCE_EXTRACT_FAILED`.
- **Breaking:** `download` takes any page yt-dlp supports and reads its metadata first. Direct media URLs and local files fail with `DOWNLOAD_FAILED`, since they are already files. `download --json` reports `source_kind: "site"` for a best-effort site.
- Reading metadata no longer asks yt-dlp for a format (`--dump-single-json --ignore-no-formats-error`), so it no longer fails on a video without a usable format URL, and pi-tube no longer reads the media URL of YouTube and Instagram at all.
- **Breaking:** yt-dlp runs with `--ignore-config`: yt-dlp configuration files (yours, or a `yt-dlp.conf` in the current or output directory) no longer apply to pi-tube's runs, so none can inject options such as `--exec`.
- **Breaking:** untitled YouTube and Instagram transcripts are named from the page URL instead of the media URL (for example `…-watch.md` and `…-www-instagram-com.md`).
- **Breaking:** the slug in a transcript file name is capped at 80 characters, so a long title no longer fails the save with `ENAMETOOLONG` after a paid transcription.
- **Breaking:** without `HOME` (the Windows default) pi-tube uses the OS home directory for `~/.pi-tube` instead of `./.pi-tube` in the working directory.

### Security

- pi-tube no longer loads a `.env` file from the current directory, so running it inside another project does not pick up that project's `.env` secrets or test hooks. The bin runs `bun --no-env-file`, which needs Bun 1.3.3 or newer (`engines.bun` is now `>=1.3.3`). Bun still reads a `bunfig.toml` from the current directory (including `preload` scripts); only run pi-tube in directories you trust until a later release closes that too.
- Before every yt-dlp run, pi-tube resolves the page's host and refuses it with `SOURCE_HOST_BLOCKED` (exit 5) if any of its addresses is private, loopback, link-local (cloud metadata endpoints included), multicast or reserved. IP literals in any spelling (`http://2130706433/`, `http://[::ffff:127.0.0.1]/`) are checked without DNS, and a host that does not resolve is refused. Set `network.allow_private_hosts` to `true` for hosts you trust. Limits: yt-dlp resolves the host again (DNS rebinding is not covered), follows redirects to other hosts and, for unknown pages, URLs embedded in the page, and offers no option to restrict them; a direct media URL is fetched by the provider's servers, not by your machine, so it is not checked.
- CI checks out the repository without persisting the GitHub token in the git config.

Releases up to 2.2.1 predate this file: see the [npm version history](https://www.npmjs.com/package/@syxs/pi-tube?activeTab=versions) and the git log.
