# Concurrent config mutations

On 2026-11-24, [spec #43](https://github.com/Lag0/pi-tube/issues/43) and [ticket #44](https://github.com/Lag0/pi-tube/issues/44) addressed finding 3 of the [audit](https://github.com/Lag0/pi-tube/issues/31): two successful local CLI mutations must produce a file consistent with applying both commands in some serial order. Atomic rename alone does not preserve edits computed from stale reads; a stale update could even restore a credential removed by logout.

On 2026-11-24, [Lag0/pi-tube@b390386](https://github.com/Lag0/pi-tube/commit/b390386) merged [PR #45](https://github.com/Lag0/pi-tube/pull/45). Writers coordinated the read, mutation and publication; read-only commands did not participate. The two-process tests used fake credentials and temporary config files. Separate tests distinguished prepublication cancellation from cleanup errors and checked that the latter did not replace the primary result. The [CI run on the reviewed head](https://github.com/Lag0/pi-tube/actions/runs/45485569019) passed on Windows, Ubuntu and macOS. #43 and #44 were closed, not the parent audit. This delivery did not coordinate arbitrary external editors or promise distributed-filesystem semantics.

Related: [Paid transcription](paid-transcription.md) records a different concurrency contract: avoiding duplicate provider dispatch, not serializing config edits.
