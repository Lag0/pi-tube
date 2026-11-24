# Paid transcription

On 2026-11-24, the [audit](https://github.com/Lag0/pi-tube/issues/31) and [Lag0/pi-tube@ea99bcb](https://github.com/Lag0/pi-tube/blob/ea99bcb/src/core/application/transcribe.ts) showed why settling a collision when saving a transcript was too late: two ordinary callers could already have dispatched paid work. The library activity protection described in [Cleanup and portability](cleanup.md) served a different purpose.

On 2026-11-24, [spec #38](https://github.com/Lag0/pi-tube/issues/38) and [ticket #39](https://github.com/Lag0/pi-tube/issues/39) scoped the first fix to overlapping ordinary requests. One fake provider invocation across independent CLI/MCP processes is stronger evidence than one saved file. Bare `force` expresses a new intent; a provider accepting work before a process crashes leaves a different, unresolved billing question. No exactly-once recovery guarantee was made.
