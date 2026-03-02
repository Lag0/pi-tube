# pi-tube

`pi-tube` is a Bun + TypeScript CLI for turning media inputs into structured artifacts.

Current delivery status: Phase 3 source intake is active (YouTube, Instagram public URLs, direct media URLs, and local files). Provider execution remains deferred to Phase 4.

## Install (macOS/Linux)

### Quick install

```bash
curl -fsSL https://raw.githubusercontent.com/Lag0/pi-tube/master/install.sh | bash
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
```

## Help Contract (Phase 3)

The top-level help is intentionally fixed in this order:

1. Usage
2. Commands
3. Global options
4. Examples
5. Notes

## Command Surface

Implemented now:

- `pi-tube <input>`
- `pi-tube --help`
- `pi-tube --version`

Deferred command aliases (non-zero guidance, use baseline input path):

- `pi-tube youtube <url>` (use `pi-tube <input>`)
- `pi-tube instagram <url>` (use `pi-tube <input>`)

Coming soon:

- `pi-tube deepgram <input>` (Phase 4)
- `pi-tube groq <input>` (Phase 4)
- `pi-tube --json <input>` (Phase 5)

## Examples

```bash
pi-tube "https://youtube.com/watch?v=dQw4w9WgXcQ"   # active
pi-tube "https://instagram.com/reel/abc123"         # active (public URLs only)
pi-tube "https://cdn.example.com/audio/demo.wav"    # active
pi-tube "./recording.mp3"                           # active
pi-tube --json "https://youtube.com/watch?v=dQw4w9WgXcQ"  # coming soon (Phase 5)
```

## Instagram Public-Only Policy

- Supported URL classes: Instagram public post/reel/video URLs (for example `/p/...`, `/reel/...`, `/tv/...`).
- Auth-gated Instagram inputs fail with `INSTAGRAM_AUTH_REQUIRED`.
- CLI exits non-zero on auth-required failures and prints remediation guidance to use publicly accessible URLs.

## Runtime Policy

The primary runtime path is Bun + TypeScript. Python runtime is not required for the v1 default path.

Legacy command patterns are still recognized for compatibility messaging only and do not route back to Python behavior.
