# Debug Session: Deepgram fails for YouTube/Instagram transcription

## Objective
Investigate why `--provider deepgram` fails for YouTube/Instagram while Groq succeeds.

## Symptoms
- Expected: `pi-tube --provider deepgram <youtube|instagram-url>` returns transcript.
- Actual:
  - YouTube sometimes worked, Instagram returned `TRANSCRIPTION_PROVIDER_INVALID_RESPONSE`.
  - Provider response carried `error: null` but transcript text was empty.

## Investigation
1. Reproduced with local CLI on both URLs.
2. Validated downloaded media from `yt-dlp` is valid AAC/M4A (not corrupt):
   - `file` + `ffprobe` checks passed.
3. Isolated Deepgram SDK calls directly against the same downloaded files.
4. Observed behavior with `model: nova-3`:
   - English audio + auto language: transcript present.
   - Portuguese audio + auto language: empty transcript, no provider error.
5. Retested Portuguese audio with `detect_language: true`:
   - Transcript returned correctly and `detected_language: pt` present.

## Root Cause
Deepgram provider did not set `detect_language: true` when language was not explicitly requested.
For non-English audio this can return an empty transcript with no SDK error, which our parser correctly treats as invalid provider response.

## Fix Applied
- File: `src/transcription/providers/deepgram.ts`
- Change:
  - If `request.requestedLanguage` exists: keep `language` as before.
  - Else: set `detect_language = true` in transcription options.

## Tests Added
- File: `test/transcription/deepgram-provider.test.ts`
- New test: `enables detect_language when no language is explicitly requested`.

## Verification
- `bun test test/transcription/deepgram-provider.test.ts` -> pass
- Local CLI repro after fix:
  - `bun run --bun bin/pi-tube.ts --provider deepgram "https://www.instagram.com/p/DVOmbJ_AAZx/?igsh=MXh3ZXAwN2ZseW94"` -> exit 0, detected language `pt`
  - `bun run --bun bin/pi-tube.ts --provider deepgram "https://www.youtube.com/watch?v=m_I8J0U-BIY"` -> exit 0, detected language `en`

## Status
Resolved.
