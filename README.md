# pi-tube

`pi-tube` is a Bun + TypeScript CLI for turning media inputs into structured artifacts.

Phase 1 ships the runtime/contract foundation and command discoverability. Source/provider execution remains intentionally deferred.

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

## Help Contract (Phase 1)

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

Coming soon (deterministic placeholders with non-zero exits):

- `pi-tube youtube <url>` (Phase 2)
- `pi-tube instagram <url>` (Phase 3)
- `pi-tube deepgram <input>` (Phase 4)
- `pi-tube groq <input>` (Phase 4)
- `pi-tube --json <input>` (Phase 5)

## Examples

```bash
pi-tube "https://youtube.com/watch?v=dQw4w9WgXcQ"   # coming soon (Phase 2)
pi-tube "https://instagram.com/reel/abc123"         # coming soon (Phase 3)
pi-tube "./recording.mp3"                           # coming soon (Phase 2)
pi-tube --json "https://youtube.com/watch?v=dQw4w9WgXcQ"  # coming soon (Phase 5)
```

## Runtime Policy

The primary runtime path is Bun + TypeScript. Python runtime is not required for the v1 default path.

Legacy command patterns are still recognized for compatibility messaging only and do not route back to Python behavior.
