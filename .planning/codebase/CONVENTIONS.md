# Coding Conventions

**Analysis Date:** 2026-03-02

## Naming Patterns

**Files:**
- Python modules use `snake_case.py` (e.g., `downloader.py`, `audio.py`)
- Provider implementations are service-named modules under `pi_tube/transcribe/` (`deepgram.py`, `groq.py`)

**Functions:**
- `snake_case` for functions and methods (`download_audio`, `is_youtube_url`, `check_latest_version`)
- Private helpers prefixed with `_` in `pi_tube/cli.py` (`_transcribe_with_provider`, `_load_config`)

**Variables:**
- `snake_case` for local variables
- `UPPER_SNAKE_CASE` for constants and config keys (`DEEPGRAM_API_KEY`, `SUPPORTED_VIDEO_FORMATS`)

**Types:**
- PascalCase for classes (`Config`, `GroqProvider`, `TranscriptionResult`)
- Enum values in lowercase string form for CLI UX (`Provider.deepgram`, `Provider.groq`)

## Code Style

**Formatting:**
- No explicit formatter config file detected (`ruff`, `black`, `isort` configs not present)
- Existing style is PEP8-like with docstrings on modules/classes/functions
- Indentation: 4 spaces
- Strings use both single and double quotes; preserve local file style when editing

**Linting:**
- No lint configuration detected in repository root
- No lint command configured in `pyproject.toml`

## Import Organization

**Order used in modules:**
1. Standard library imports
2. Third-party library imports
3. Local package imports (`from .` / `from ..`)

**Grouping:**
- Blank lines separate import groups in most modules
- Relative imports used consistently for intra-package references

**Path Aliases:**
- None detected (standard Python package import resolution only)

## Error Handling

**Patterns:**
- Raise explicit exceptions in lower-level modules (`ValueError`, `FileNotFoundError`)
- CLI command boundaries catch broad exceptions and convert to user-facing terminal failures (`typer.Exit(1)`)
- Provider-specific API errors are translated to readable messages (see `ApiError` handling in `pi_tube/transcribe/deepgram.py`)

**Guideline for new code:**
- Keep specific error types in provider/utility layers
- Map errors to friendly CLI messages only at command orchestration layer

## Logging

**Framework:**
- Rich console rendering (`Console`, `Panel`, `Table`) instead of plain `print` for main CLI flows

**Patterns:**
- Success states use checkmark + green styling
- Operational steps are printed before/after network/media operations
- Keep verbose logs out of low-level pure helpers unless directly useful to CLI feedback

## Comments

**When to Comment:**
- Existing code comments explain intent around UX/performance behavior (e.g., update check rationale)
- Prefer brief rationale comments over line-by-line narration

**Docstrings:**
- Module docstrings present across files
- Public functions and classes generally include descriptive docstrings

**TODO comments:**
- No active TODO/FIXME markers detected in tracked source files

## Function Design

**Size:**
- Most modules keep functions focused
- `pi_tube/cli.py` contains a large orchestration function (`_transcribe_with_provider`) and many commands; treat as a coordinator module

**Parameters:**
- Typed function signatures are common (`Optional[Path]`, `Optional[str]`)
- CLI options use Typer `Argument`/`Option` metadata extensively

**Return Values:**
- Utilities and providers return typed objects or `Path`
- CLI command functions usually return `None` and exit via Typer on failure

## Module Design

**Exports:**
- Package-level exports centralized in `pi_tube/transcribe/__init__.py`
- Main package version surfaced in `pi_tube/__init__.py`

**Boundaries:**
- Keep provider-specific SDK logic inside `pi_tube/transcribe/`
- Keep media ingestion logic in `downloader.py` and `audio.py`
- Keep config/env behavior in `config.py`

---

*Convention analysis: 2026-03-02*
*Update when patterns change*
