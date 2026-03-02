# Testing Patterns

**Analysis Date:** 2026-03-02

## Test Framework

**Runner:**
- Not detected in project configuration
- No `pytest`, `unittest`, `tox`, `nox`, or other runner config files found

**Assertion Library:**
- Not applicable (no project tests present)

**Run Commands:**
```bash
# Not currently defined in project
# No test command found in pyproject.toml
```

## Test File Organization

**Location:**
- No repository-owned test directory detected (excluding third-party packages inside `.venv/`)

**Naming:**
- No project test naming convention established yet

**Current structure signal:**
```
pi-tube/
  pi_tube/
    *.py
  # tests/ directory not present
```

## Test Structure

**Suite Organization:**
- No test suites exist yet, so no established `describe`/class/function style

**Recommended baseline for this repo (to standardize future work):**
- Use `pytest`
- Keep unit tests in top-level `tests/`
- Mirror package structure for discoverability

Example target structure:
```text
tests/
  test_cli.py
  test_downloader.py
  test_audio.py
  transcribe/
    test_deepgram.py
    test_groq.py
```

## Mocking

**Current framework:**
- Not detected

**Where mocking will be required first:**
- External APIs (`deepgram`, `groq`) in provider tests
- Network/media extraction via `yt-dlp`
- `ffmpeg` execution paths
- `urllib.request.urlopen` in version-check tests (`pi_tube/utils.py`)

## Fixtures and Factories

**Current state:**
- No fixtures/factories detected

**Recommended starter fixtures:**
- Small local media fixture files for conversion/transcription pipeline tests
- Fake provider responses for deterministic CLI output checks
- Temporary directory fixture for output path assertions

## Coverage

**Requirements:**
- No coverage target configured
- No CI enforcement detected

**Critical coverage priorities (in order):**
1. CLI branching logic in `_transcribe_with_provider()` (`pi_tube/cli.py`)
2. Provider error translation and failure paths (`pi_tube/transcribe/deepgram.py`, `pi_tube/transcribe/groq.py`)
3. Filename normalization and version-check behavior (`pi_tube/utils.py`)
4. Download path and existing-file reuse behavior (`pi_tube/downloader.py`)

## Test Types

**Unit Tests:**
- Missing
- Highest ROI: pure utility and validation functions (`slugify`, `is_youtube_url`, format checks)

**Integration Tests:**
- Missing
- Recommended scope: end-to-end CLI command execution with mocked external services

**E2E Tests:**
- Missing
- Optional for this CLI, but useful for installer and full command smoke checks

## Common Patterns

**Current observable quality safeguards:**
- Manual runtime checks and explicit error messages in command code
- Type hints and docstrings help readability but do not replace tests

**Gap summary:**
- No automated regression protection currently in repository

---

*Testing analysis: 2026-03-02*
*Update when test patterns change*
