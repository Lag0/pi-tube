# Technology Stack

**Analysis Date:** 2026-03-02

## Languages

**Primary:**
- Python 3.11+ - All application source code in `pi_tube/` and entrypoint `main.py`

**Secondary:**
- Bash - Installer script in `install.sh`
- Markdown - Project documentation in `README.md`

## Runtime

**Environment:**
- CPython 3.11+ (required by `pyproject.toml`)
- CLI runtime only (no long-running server process)

**Package Manager:**
- `uv` for development and installation workflow (`uv sync`, `uv tool install`)
- Lockfile: `uv.lock` present

## Frameworks

**Core:**
- Typer `>=0.21.1` - CLI command routing and argument parsing in `pi_tube/cli.py`
- Rich `>=14.3.2` - Console UI (panels, tables, colored status)

**Testing:**
- Not detected in project dependencies (no test runner configured in `pyproject.toml`)

**Build/Dev:**
- Hatchling - Packaging backend (`[build-system]` in `pyproject.toml`)
- pipx/uv tool install flow - distribution and user installation path (`install.sh`)

## Key Dependencies

**Critical:**
- `yt-dlp>=2026.2.4` - YouTube metadata extraction and media download (`pi_tube/downloader.py`)
- `deepgram-sdk>=5.3.2` - Deepgram Nova 3 transcription (`pi_tube/transcribe/deepgram.py`)
- `groq>=1.0.0` - Groq Whisper transcription (`pi_tube/transcribe/groq.py`)
- `ffmpeg-python>=0.2.0` - Audio extraction/transcoding wrapper (`pi_tube/audio.py`)
- `python-dotenv>=1.2.1` - `.env` loading at startup (`pi_tube/config.py`)

**Infrastructure:**
- Standard library (`pathlib`, `urllib.request`, `tomllib`) - file handling and update check logic (`pi_tube/utils.py`)

## Configuration

**Environment:**
- Local `.env` file is loaded automatically by `load_dotenv()` in `pi_tube/config.py`
- Optional user config file at `~/.config/pi-tube/config` is loaded and merged into process env
- Required keys for cloud transcription: `DEEPGRAM_API_KEY`, `GROQ_API_KEY` (defined in `.env.example`)

**Build:**
- Project metadata and dependencies in `pyproject.toml`
- Exact dependency resolution in `uv.lock`

## Platform Requirements

**Development:**
- Python 3.11+
- `ffmpeg` binary available in PATH (hard prerequisite in `install.sh` and runtime conversion path)
- `uv` installed for sync/install convenience

**Production:**
- User machine CLI install via `uv tool` (from GitHub repository)
- Network access required for Deepgram/Groq APIs and YouTube download operations

---

*Stack analysis: 2026-03-02*
*Update after major dependency changes*
