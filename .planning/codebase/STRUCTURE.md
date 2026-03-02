# Codebase Structure

**Analysis Date:** 2026-03-02

## Directory Layout

```
pi-tube/
├── pi_tube/                    # Main Python package
│   ├── transcribe/             # Provider interface and implementations
│   ├── cli.py                  # Typer command definitions and orchestration
│   ├── downloader.py           # YouTube download helpers
│   ├── audio.py                # Audio extraction/conversion logic
│   ├── config.py               # Env/config loading and path constants
│   └── utils.py                # Utility helpers (slugify, version check)
├── .agent/skills/pi-tube/      # Local agent skill metadata
├── .venv/                      # Local virtual environment (gitignored)
├── README.md                   # User documentation
├── pyproject.toml              # Project metadata and dependencies
├── uv.lock                     # Locked dependency graph
├── install.sh                  # Bootstrap installer script
└── main.py                     # Minimal standalone script placeholder
```

## Directory Purposes

**`pi_tube/`:**
- Purpose: Core application code for command execution and transcription pipeline
- Contains: Python modules (`*.py`) and provider subpackage
- Key files: `cli.py`, `downloader.py`, `audio.py`, `config.py`
- Subdirectories: `transcribe/` for provider abstraction and implementations

**`pi_tube/transcribe/`:**
- Purpose: Encapsulate cloud provider integrations behind common interface
- Contains: `base.py`, `deepgram.py`, `groq.py`, `__init__.py`
- Key files: `base.py` contract, provider-specific clients
- Subdirectories: none

**`.agent/skills/pi-tube/`:**
- Purpose: Skill definition used by local agent tooling
- Contains: `SKILL.md`
- Key files: `SKILL.md`
- Subdirectories: none

## Key File Locations

**Entry Points:**
- `pi_tube/cli.py`: Main executable logic for `pi-tube` command
- `main.py`: Separate placeholder script (not used by package entrypoint)

**Configuration:**
- `pyproject.toml`: Dependencies, Python version, script entrypoint
- `.env.example`: Required environment variable names
- `.gitignore`: Local secret and build artifact exclusions

**Core Logic:**
- `pi_tube/downloader.py`: YouTube metadata/download flow
- `pi_tube/audio.py`: ffmpeg-backed conversion and media checks
- `pi_tube/transcribe/deepgram.py`: Deepgram implementation
- `pi_tube/transcribe/groq.py`: Groq implementation

**Testing:**
- No project test directory/files detected (excluding `.venv/` vendor package tests)

**Documentation:**
- `README.md`: Installation and usage guide
- `.agent/skills/pi-tube/SKILL.md`: Agent operation instructions

## Naming Conventions

**Files:**
- `snake_case.py` for Python modules (`downloader.py`, `audio.py`, `config.py`)
- Provider modules grouped by service name under `pi_tube/transcribe/`

**Directories:**
- `snake_case` for Python package directories (`pi_tube`, `transcribe`)
- Dot-prefixed directories for local tooling and environment (`.agent`, `.venv`)

**Special Patterns:**
- `__init__.py` for package boundaries and export lists

## Where to Add New Code

**New Transcription Provider:**
- Primary code: `pi_tube/transcribe/<provider>.py`
- Provider export: `pi_tube/transcribe/__init__.py`
- CLI wiring: `Provider` enum + `get_provider()` in `pi_tube/cli.py`

**New CLI Command:**
- Definition and options: `pi_tube/cli.py`
- Supporting logic: dedicated module under `pi_tube/` (avoid overgrowing `cli.py`)

**New Media Utility:**
- Shared media processing: `pi_tube/audio.py` or dedicated new module in `pi_tube/`
- Download-related logic: `pi_tube/downloader.py`

**Tests (when introduced):**
- Prefer top-level `tests/` with mirrored package structure
- Example placement: `tests/test_downloader.py`, `tests/transcribe/test_deepgram.py`

## Special Directories

**`.venv/`:**
- Purpose: Local development virtual environment
- Source: Generated locally by tooling (`uv`, `python -m venv`, etc.)
- Committed: No (`.gitignore` excludes `.venv`)

---

*Structure analysis: 2026-03-02*
*Update when directory structure changes*
