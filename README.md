# pi-tube

Bun + TypeScript CLI foundation for `pi-tube`.

## Current Phase (Phase 1)

This release locks command identity and CLI discoverability while source/provider execution is still coming soon.

### Available now

- Canonical command identity remains `pi-tube`
- Deterministic top-level help (`Usage -> Commands -> Global options -> Examples -> Notes`)
- Deterministic non-zero placeholder behavior for deferred features
- Legacy command compatibility guidance (`deepgram`, `groq`, `dl`, `providers`, `config`)

### Coming soon

- Core source intake (`youtube`, direct URLs, local files) in Phase 2
- Instagram public intake in Phase 3
- Provider command routing (`deepgram`, `groq`) in Phase 4

## Quick Start (Bun/TS default path)

```bash
bun install
bun run --bun bin/pi-tube.ts --help
bun run --bun bin/pi-tube.ts --version
```

## Canonical Usage

```bash
pi-tube <input>
pi-tube --help
pi-tube --version
pi-tube --json <input>   # coming soon (Phase 5)
```

### Example placeholders

```bash
pi-tube "https://youtube.com/watch?v=dQw4w9WgXcQ"   # coming soon (Phase 2)
pi-tube "https://instagram.com/reel/abc123"         # coming soon (Phase 3)
pi-tube "./recording.mp3"                           # coming soon (Phase 2)
```

## Legacy Migration Notes

If you run old command patterns such as `pi-tube deepgram <input>`, the Bun CLI returns deterministic migration guidance and exits non-zero. This is expected during migration.

## Runtime Policy

Primary execution path is Bun + TypeScript. Python runtime is not required for the v1 default CLI path.
