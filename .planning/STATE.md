---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 07-02-PLAN.md
last_updated: "2026-03-04T15:00:00Z"
last_activity: 2026-03-04 - Executed 07-02 (friendly config aliases + deterministic validation alignment)
progress:
  total_phases: 7
  completed_phases: 6
  total_plans: 27
  completed_plans: 25
  percent: 93
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-02)

**Core value:** Turn public media inputs into trustworthy, structured, ready-to-use knowledge artifacts fast.
**Current focus:** Phase 7 execution in progress — Wave 2 (config/setup UX) is next.

## Current Position

Phase: 7 of 7 (CLI UX Overhaul)
Plan: 2 of 4 executed
Status: Phase 7 in progress
Last activity: 2026-03-04 - Executed 07-02 (friendly config aliases + deterministic validation alignment)

Progress: [█████████░] 93%

## Performance Metrics

**Velocity:**
- Total plans completed: 25
- Average duration: 10.2 min
- Total execution time: 4.23 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 4 | 5 min | 1.3 min |
| 2 | 4 | 6 min | 1.5 min |
| 3 | 3 | 15 min | 5.0 min |
| 4 | 4 | 38 min | 9.5 min |
| 5 | 4 | 11 min | 2.8 min |
| 6 | 4 | 104 min | 26.0 min |

**Recent Trend:**
- Last 5 plans: 06-02 (27 min), 06-03 (24 min), 06-04 (19 min), 07-01 (42 min), 07-02 (33 min)
- Trend: CLI UX refactor plans remain longer due migration-safe behavior and expanded regression coverage.

*Updated after each plan completion*
| Phase 03 P01 | 8 min | 3 tasks | 7 files |
| Phase 03 P02 | 4 min | 3 tasks | 6 files |
| Phase 03 P03 | 3 min | 3 tasks | 4 files |
| Phase 04 P01 | 9 min | 3 tasks | 6 files |
| Phase 04 P02 | 8 min | 3 tasks | 6 files |
| Phase 04 P03 | 5 min | 3 tasks | 3 files |
| Phase 04 P04 | 16 min | 3 tasks | 11 files |
| Phase 05 P01 | 2 min | 3 tasks | 10 files |
| Phase 05 P02 | 1 min | 3 tasks | 6 files |
| Phase 05 P03 | 1 min | 3 tasks | 7 files |
| Phase 05 P04 | 3 min | 3 tasks | 11 files |
| Phase 06 P01 | 34 min | 3 tasks | 10 files |
| Phase 06 P02 | 27 min | 3 tasks | 6 files |
| Phase 06 P03 | 24 min | 3 tasks | 7 files |
| Phase 06 P04 | 19 min | 3 tasks | 5 files |
| Phase 07 P01 | 42 min | 3 tasks | 6 files |
| Phase 07 P02 | 33 min | 3 tasks | 8 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Initialization]: Full cutover to TypeScript + Bun in v1
- [Initialization]: Instagram public post/reel/video in core, public-only policy
- [Initialization]: Markdown default + optional deterministic `--json`
- [Phase 1 Planning]: Contract-first Bun CLI with deterministic placeholder behavior
- [01-01 Execution]: Keep placeholder paths deterministic and non-zero to protect automation correctness.
- [01-02 Execution]: Deferred command verbs stay visible in help but must hard-fail with phase-aware guidance.
- [01-03 Execution]: Legacy command compatibility is guidance-only and never proxies back to Python runtime behavior.
- [01-04 Execution]: Installer and README are treated as contract artifacts and validated by regression tests.
- [02-01 Execution]: Non-YouTube HTTP(S) input must pass direct-media extension policy or fail with `UNSUPPORTED_URL_NOT_DIRECT_MEDIA`.
- [02-01 Execution]: Keep `resolveSource` async and adapter-agnostic to avoid CLI contract churn in later phases.
- [02-02 Execution]: Wrap yt-dlp in a dedicated boundary module and map subprocess failures to stable public error codes.
- [02-02 Execution]: Use dependency injection in adapter tests to mock yt-dlp outcomes deterministically.
- [02-03 Execution]: Normalize accepted direct media URLs by stripping fragments for deterministic source identity.
- [02-03 Execution]: Local-file intake requires existence and supported extension checks before contract handoff.
- [02-04 Execution]: Baseline CLI success output uses `[INTAKE_RESOLVED] kind=...` markers for deterministic integration checks.
- [02-04 Execution]: Provider execution remains deferred to Phase 4 even after Phase 2 intake success.
- [Phase 03]: Instagram public URL support constrained to /p/, /reel/, and /tv/ for deterministic scope — Keeps SRC-02 behavior explicit and avoids unsupported Instagram surfaces.
- [Phase 03]: Instagram extraction reuses yt-dlp boundary with dedicated adapter entrypoint — Preserves adapter architecture and avoids introducing a second extraction stack.
- [Phase 03]: Instagram auth-required signatures map to INSTAGRAM_AUTH_REQUIRED at extractor boundary — CLI must provide deterministic public-only remediation for SRC-03
- [Phase 03]: Instagram non-auth extraction failures remain INSTAGRAM_EXTRACT_FAILED — Prevents confusing remediation when failures are unrelated to authentication
- [Phase 03]: CLI help keeps instagram alias deferred while baseline input path remains authoritative — Maintains stable command contract while Instagram intake runs through pi-tube <input>.
- [Phase 03]: Help and README explicitly mention INSTAGRAM_AUTH_REQUIRED and public-only policy — Improves deterministic troubleshooting for agent and human users.
- [Phase 04]: Provider selection precedence is CLI option first, then PI_TUBE_TRANSCRIPTION_PROVIDER, then default deepgram. — Guarantees deterministic provider behavior across CLI and automation contexts.
- [Phase 04]: Language preference is normalized once in service boundary and forwarded through canonical request fields. — Keeps provider adapters simple and preserves a single response contract.
- [Phase 04]: Deepgram adapter maps provider HTTP status classes into stable shared provider error constructors. — Prevents provider-native message churn from leaking into public CLI contracts.
- [Phase 04]: Missing DEEPGRAM_API_KEY is treated as provider auth failure at adapter boundary. — Yields deterministic remediation path before any network call.
- [Phase 04]: Groq adapter maps into the same stable public provider error taxonomy used by Deepgram. — Provider switching must not change error-code contract.
- [Phase 04]: Groq response parser accepts canonical text/language fields and rejects malformed payloads deterministically. — Protects CLI contract from provider response drift.
- [Phase 04]: Provider choice remains an option (--provider) on baseline pi-tube <input> instead of introducing new command verbs. — Preserves contract stability while enabling provider switching.
- [Phase 04]: Language preference uses CLI override with PI_TUBE_TRANSCRIPTION_LANGUAGE env fallback. — Provides deterministic precedence for automation and manual usage.
- [Phase 05]: Output rendering is contract-first through one schema-versioned `OutputArtifact` model shared by Markdown and JSON. — Prevents renderer drift and centralizes output semantics.
- [Phase 05]: Segment/timestamp normalization occurs in provider adapters and is passed through service boundary as optional canonical segments. — Keeps renderer logic provider-agnostic and deterministic.
- [Phase 05]: `--json` is now an active output mode selected only at the final renderer step. — Preserves one execution/intake/transcription flow while supporting both human and agent output needs.
- [Phase 05]: `provider-status` readiness output is deterministic and offline, derived from provider registry + env presence only. — Avoids network nondeterminism and improves agent usability.
- [Phase 06]: Enabled deterministic config command flow with explicit precedence — CLI flags now override config defaults, which override env defaults, to keep runtime behavior predictable and testable.
- [Phase 06]: Centralized all public CLI error codes in one catalog — Error constructors and tests now derive from ERROR_CATALOG to prevent code/exit/guidance drift.
- [Phase 06]: Established golden fixture regression gate for output contracts — Committed markdown/json fixtures plus verify:fixtures command detect renderer drift before release.
- [Phase 06]: CI now enforces bun test and fixture verification as release gates — Automation and checklist/test references are aligned to prevent drift between local and CI reliability checks.
- [Phase 07 Planning]: Help UX will move from one static renderer to scoped root/subcommand help with dedicated `help` command semantics.
- [Phase 07 Planning]: Config UX will gain intuitive command aliases while preserving legacy dot-path compatibility for existing automation.
- [Phase 07 Execution]: Help rendering now uses a shared document+theme pipeline with scoped `help` routes for root/config/setup/provider status.
- [Phase 07 Execution]: `--no-color` is a first-class help flag to guarantee readable deterministic fallback output.
- [Phase 07 Execution]: Friendly `config provider|language` aliases map to canonical keys while preserving legacy dot-path commands.
- [Phase 07 Execution]: Config validation now normalizes friendly and legacy failures to `CLI_CONTRACT_VIOLATION`.

### Roadmap Evolution

- Phase 7 added: Melhorar UX da CLI: help colorido com subcomandos, layout intuitivo e paridade 1:1 com experiência do OpenClaw
- Phase 7 planned: 4 plans across 3 waves (help foundation, config/setup UX, regression lock)
- Phase 7 execution started: 07-01 completed with scoped help and color/no-color support
- Phase 7 wave 2 progress: 07-02 completed with config alias migration path and deterministic validation

### Pending Todos

None yet.

### Blockers/Concerns

- Instagram extractor stability may fluctuate; keep adapter isolation and smoke tests active.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | o time stamp ta por keyword, isso deixa o arquivo muito grande e come muito contexto do AI, fora que deixa o arquivo impossivel de ler para humanos. Tem que pensar em outra solução | 2026-03-03 | 3ee352d | [1-o-time-stamp-ta-por-keyword-isso-deixa-o](./quick/1-o-time-stamp-ta-por-keyword-isso-deixa-o/) |
| 2 | No caso eu quero interativo por padrão, que é para humanos instalarem e eu quero não interativo com flag para AIs instalarem. E o não interativo deve ser junto com o global, deve ser para instalar o pacote de maneira global na máquina com o symlink. E alem disso ele deve executar o comando, não só enviar qual comando deve ser executado | 2026-03-03 | 362c2cc | [2-no-caso-eu-quero-interativo-por-padr-o-q](./quick/2-no-caso-eu-quero-interativo-por-padr-o-q/) |
| 3 | gostaria que o output padrão da resposta fosse na ~/.pi-tube/YYYY-MM-DD-(titulo do video, nome do arquivo). e no stdout do terminal linkasse esse arquivo para poder clicar e abri-lo | 2026-03-04 | a61ac34 | [3-gostaria-que-o-output-padr-o-da-resposta](./quick/3-gostaria-que-o-output-padr-o-da-resposta/) |

## Session Continuity

Last session: 2026-03-04T13:55:21.322Z
Stopped at: Completed 07-02-PLAN.md
Resume file: .planning/phases/07-melhorar-ux-da-cli-help-colorido-com-subcomandos-layout-intuitivo-e-paridade-1-1-com-experi-ncia-do-openclaw/07-03-PLAN.md
