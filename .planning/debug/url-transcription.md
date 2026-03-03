# Debug Session: URL transcription failure

## Objective
Investigate and fix failure when transcribing YouTube URL input via `pi-tube <url>`.

## Symptoms
- Expected: `pi-tube "https://www.youtube.com/watch?v=m_I8J0U-BIY"` should transcribe successfully.
- Actual: command exited with code 2 and provider errors.
- Errors observed:
  - Deepgram: `TRANSCRIPTION_PROVIDER_FAILED` with `failed to process audio: corrupt or unsupported data`.
  - Groq: `TRANSCRIPTION_PROVIDER_INVALID_RESPONSE`.
- Repro: deterministic on local and global CLI.

## Investigation
1. Confirmed providers configured and local file transcription succeeds.
2. Inspected `resolveYouTubeWithYtDlp` output from current parser.
3. Found selected URL was storyboard image (`i.ytimg...storyboard.jpg`) from `formats[0]`.
4. Added media URL selection hardening and YouTube audio format selection in yt-dlp invocation.
5. Re-tested URL transcription: still failed for provider URL ingestion.
6. Hypothesis validated: provider-side fetch of YouTube transient URLs is unreliable.
7. Implemented provider media preparation fallback:
   - for `youtube`/`instagram` sources, download audio locally via `yt-dlp`
   - upload as `file` multipart instead of `url`

## Root Cause
Two compounding issues:
1. Intake parser selected non-media storyboard URL when top-level `url` was absent in yt-dlp JSON.
2. Even with corrected audio URL, provider URL-fetch path is unreliable for YouTube transient links.

## Fix Applied
- `src/intake/tools/yt-dlp.ts`
  - Added robust media URL selection (ignore storyboard/image/mhtml, prefer audio candidates).
  - Changed YouTube yt-dlp args to `-f bestaudio[ext=m4a]/bestaudio/best`.
- `src/transcription/providers/media-input.ts` (new)
  - Added provider media input preparation.
  - For `youtube`/`instagram`, download audio with yt-dlp and return `file` input.
  - For `direct_url`, keep URL mode.
  - For `local_file`, keep file mode.
- `src/transcription/providers/deepgram.ts`
  - Switched to async media preparation helper and cleanup hook.
- `src/transcription/providers/groq.ts`
  - Switched to async media preparation helper and cleanup hook.

## SDK Migration
- `src/transcription/providers/deepgram.ts`
  - Migrated provider execution from raw `fetch` to official `@deepgram/sdk` (`createClient().listen.prerecorded`).
- `src/transcription/providers/groq.ts`
  - Migrated provider execution from raw `fetch` to official `groq-sdk` (`new Groq().audio.transcriptions.create`).
- `package.json`
  - Added runtime dependencies: `@deepgram/sdk`, `groq-sdk`.

## Verification
- Full test suite: `bun test` => 111 pass, 0 fail.
- Real command repro (local CLI):
  - `bun run pi-tube "https://www.youtube.com/watch?v=m_I8J0U-BIY"`
  - Result: exit 0, deterministic transcript generated with `source_kind: "youtube"`.

## Status
- Resolved.
