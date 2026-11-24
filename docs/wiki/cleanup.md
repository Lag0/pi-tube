# Cleanup and portability

On 2026-11-24, [Lag0/pi-tube@ea99bcb](https://github.com/Lag0/pi-tube/commit/ea99bcb) merged [PR #37](https://github.com/Lag0/pi-tube/pull/37). Its Windows backend could delete a verified transcript by handle on supported volumes. Its Linux and macOS checks verified preservation, **not** physical deletion. [The decision on #33](https://github.com/Lag0/pi-tube/issues/33#issuecomment-7141537476) kept that ticket open. Moving a replacement to quarantine was not part of the accepted contract.

On the same date, the [cleanup spec](https://github.com/Lag0/pi-tube/issues/32) assigned manual audio cleanup to [#34](https://github.com/Lag0/pi-tube/issues/34), automatic eviction to [#35](https://github.com/Lag0/pi-tube/issues/35), and protected replacement to [#36](https://github.com/Lag0/pi-tube/issues/36). None of those paths was delivered by #37. The paid-work consequence of an automatic retry is discussed in [Paid transcription](paid-transcription.md).
