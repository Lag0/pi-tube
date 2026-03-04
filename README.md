# pi-tube

`pi-tube` is a Bun + TypeScript CLI for turning media inputs into structured artifacts.

Current delivery status: Phase 6 reliability hardening is active (deterministic config flow, stable error contracts, golden fixtures, and release gates).

## Install (macOS/Linux)

### npm install (published package)

```bash
npm install -g @syxs/pi-tube
```

Or without global install:

```bash
npx -y @syxs/pi-tube --help
```

### Quick install

```bash
curl -fsSL https://raw.githubusercontent.com/Lag0/pi-tube/main/install.sh | bash
```

### Local dev install

```bash
git clone https://github.com/Lag0/pi-tube.git
cd pi-tube
bun install
```

## Run

```bash
pi-tube --help
pi-tube --version
pi-tube <input>
pi-tube setup install
pi-tube setup skills
```

## Help Contract (Phase 5)

The top-level help is intentionally fixed in this order:

1. Usage
2. Commands
3. Global options
4. Examples
5. Notes

## Command Surface

Implemented now:

- `pi-tube <input>`
- `pi-tube --json <input>`
- `pi-tube --provider <deepgram|groq> <input>`
- `pi-tube --language <code> <input>`
- `pi-tube --timestamps <input>` (optional timestamp blocks, default off)
- `pi-tube setup install`
- `pi-tube setup skills [--global] [--agent <name>]`
- `pi-tube config set <key> <value>`
- `pi-tube config get <key>`
- `pi-tube config list`
- `pi-tube config provider set <deepgram|groq>`
- `pi-tube config provider env <deepgram|groq> <ENV_VAR>`
- `pi-tube config language set <code>`
- `pi-tube provider-status`
- `pi-tube --json provider-status`
- `pi-tube --help`
- `pi-tube --version`

Deferred command aliases (non-zero guidance, use baseline input path):

- `pi-tube youtube <url>` (use `pi-tube <input>`)
- `pi-tube instagram <url>` (use `pi-tube <input>`)

## Examples

```bash
pi-tube "https://youtube.com/watch?v=dQw4w9WgXcQ"   # active
pi-tube --provider deepgram "https://youtube.com/watch?v=dQw4w9WgXcQ"  # active
pi-tube --provider groq --language pt "./recording.mp3"                # active
pi-tube --timestamps "https://youtube.com/watch?v=dQw4w9WgXcQ"         # include timestamp blocks
pi-tube "https://instagram.com/reel/abc123"         # active (public URLs only)
pi-tube "https://cdn.example.com/audio/demo.wav"    # active
pi-tube "./recording.mp3"                           # active
pi-tube --json "https://youtube.com/watch?v=dQw4w9WgXcQ"  # active JSON output
pi-tube setup install                                      # npm install/setup guidance
pi-tube setup skills                                       # interactive default (human flow)
pi-tube setup skills --global                              # interactive global scope
pi-tube setup skills --agent codex                         # install for a specific agent
pi-tube config set defaults.provider groq                 # active config flow
pi-tube config set providers.groq.api_key_env GROQ_API_KEY
pi-tube config provider set groq                          # friendly provider alias
pi-tube config provider env groq GROQ_API_KEY             # friendly env alias
pi-tube config language set pt-BR                         # friendly language alias
pi-tube config list
pi-tube provider-status                                   # active provider readiness
pi-tube --json provider-status                            # active readiness JSON
```

## Config Keys and Precedence

Supported configuration keys:

- `defaults.provider` (`deepgram` or `groq`)
- `defaults.language` (language code)
- `providers.deepgram.api_key`
- `providers.deepgram.api_key_env`
- `providers.groq.api_key`
- `providers.groq.api_key_env`

Friendly aliases (mapped to the same canonical keys):

- `pi-tube config provider set <deepgram|groq>` → `defaults.provider`
- `pi-tube config provider env <provider> <ENV_VAR>` → `providers.<provider>.api_key_env`
- `pi-tube config provider key <provider> <api_key>` → `providers.<provider>.api_key`
- `pi-tube config language set <code>` → `defaults.language`

Legacy `config set/get/list` dot-path commands remain supported for existing scripts.

Default config file path:

- `~/.pi-tube/config.json` (override with `PI_TUBE_CONFIG_PATH`)

Resolution precedence:

- Provider: CLI `--provider` > config `defaults.provider` > `PI_TUBE_TRANSCRIPTION_PROVIDER` > `deepgram`
- Language: CLI `--language` > config `defaults.language` > `PI_TUBE_TRANSCRIPTION_LANGUAGE`
- API key: config `providers.<id>.api_key` > env referenced by `providers.<id>.api_key_env` > default provider env (`DEEPGRAM_API_KEY`/`GROQ_API_KEY`)

## Agent Workflows

- Default output is deterministic Markdown with YAML frontmatter, extractive summary, and transcript sections.
- Baseline runs write artifacts to `~/.pi-tube/YYYY-MM-DD-<title-or-file>.{md|json}` by default.
- Stdout prints `[OUTPUT_FILE]` and `[OUTPUT_FILE_URI]` so you can click/open the generated file from terminal output.
- Timestamp blocks are disabled by default to reduce artifact size/context; use `--timestamps` when needed.
- `--json` emits a deterministic schema-versioned contract from the same canonical artifact model.
- `provider-status` reports registered providers and missing required env vars in deterministic text or JSON.
- `setup skills` installs the repository skill bundle (`skills/pi-tube`) into supported agent tooling.
- `setup skills` follows Firecrawl-style behavior: interactive default, optional `--global` and `--agent`.
- Temporary media downloads for YouTube/Instagram transcription use `~/.pi-tube/tmp` and are deleted after each run (success or error).

## Release Hardening

Before tagging a release, run the mandatory checks in [docs/release-checklist.md](docs/release-checklist.md).

npm publish automation is defined in `.github/workflows/publish.yml` with provenance and version-exists checks.

## Instagram Public-Only Policy

Before tagging a release, run the mandatory checks in [docs/release-checklist.md](docs/release-checklist.md).

npm publish automation is defined in `.github/workflows/publish.yml` with provenance and version-exists checks.

## Instagram Public-Only Policy

- Supported URL classes: Instagram public post/reel/video URLs (for example `/p/...`, `/reel/...`, `/tv/...`).
- Auth-gated Instagram inputs fail with `INSTAGRAM_AUTH_REQUIRED`.
- CLI exits non-zero on auth-required failures and prints remediation guidance to use publicly accessible URLs.

## Runtime Policy

The primary runtime path is Bun + TypeScript. Python runtime is not required for the v1 default path.

Legacy command patterns are still recognized for compatibility messaging only and do not route back to Python behavior.

## Provider Error Contract

Provider-layer failures are normalized to deterministic public codes:

- `TRANSCRIPTION_PROVIDER_AUTH`
- `TRANSCRIPTION_PROVIDER_RATE_LIMIT`
- `TRANSCRIPTION_PROVIDER_UNAVAILABLE`
- `TRANSCRIPTION_PROVIDER_FAILED`
- `TRANSCRIPTION_PROVIDER_INVALID_RESPONSE`
