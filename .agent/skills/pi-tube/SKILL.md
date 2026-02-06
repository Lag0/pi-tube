---
name: pi-tube
description: CLI for YouTube video download and transcription using cloud AI (Deepgram Nova 3, Groq Whisper)
homepage: https://github.com/Lag0/pi-tube
metadata: { "openclaw": { "emoji": "🎬", "homepage": "https://github.com/Lag0/pi-tube", "requires": { "bins": ["ffmpeg", "yt-dlp"], "anyEnv": ["DEEPGRAM_API_KEY", "GROQ_API_KEY"] }, "install": [{ "id": "script", "kind": "download", "url": "https://raw.githubusercontent.com/Lag0/pi-tube/master/install.sh", "label": "Install Pi-Tube" }] } }
---

# Pi-Tube: YouTube Transcription CLI

## When to use

Use this skill when the user asks to:

- transcribe a YouTube video
- download audio/video from YouTube
- convert video to text
- get transcription with speaker identification and summary
- get transcription using Deepgram or Groq/Whisper

## Behavioral rules

- Do everything automatically and quietly
- Only message the user when:
  - You need the YouTube URL or file path
  - You need to know which provider to use (deepgram or groq)
  - Installation or transcription fails
  - API key configuration is needed

## Inputs to ask the user for

1. **YouTube URL** or **local file path**
2. **Provider** (optional): `deepgram` or `groq` (default: deepgram)
3. **Output file** (optional): where to save transcription

---

## Step 1: Check if pi-tube is installed

```bash
which pi-tube || echo "NOT_INSTALLED"
```

If `NOT_INSTALLED`, proceed to Step 2. Otherwise skip to Step 3.

## Step 2: Install pi-tube (auto-install)

```bash
curl -fsSL https://raw.githubusercontent.com/Lag0/pi-tube/master/install.sh | bash
```

This will install:
- pi-tube CLI via uv tool
- yt-dlp CLI via uv tool
- ffmpeg (if not present)

> **Skill Directory:** The install script saves this skill to `~/.agent/skills/pi-tube/`.
> If your agent uses a different skills directory (e.g., `~/.openclaw/skills/`), copy the folder:
> ```bash
> mkdir -p ~/.openclaw/skills && cp -r ~/.agent/skills/pi-tube ~/.openclaw/skills/
> ```

## Step 3: Check API key configuration

```bash
pi-tube config show
```

If the desired provider shows "✗ Not set", ask the user for the API key and configure:

```bash
# For Deepgram
pi-tube config set deepgram USER_API_KEY

# For Groq
pi-tube config set groq USER_API_KEY
```

## Step 4: Transcribe

### YouTube video:

```bash
# Using Groq Whisper (default)
pi-tube groq "https://youtube.com/watch?v=VIDEO_ID"

# Using Deepgram Nova 3
pi-tube deepgram "https://youtube.com/watch?v=VIDEO_ID"

# With custom output
pi-tube groq "https://youtube.com/watch?v=VIDEO_ID" -o output.txt

# Specify language
pi-tube deepgram "https://youtube.com/watch?v=VIDEO_ID" -l pt
```

### Local file:

```bash
pi-tube groq /path/to/video.mp4
pi-tube deepgram /path/to/audio.mp3 -o transcription.txt
```

## Step 5: Download only (if requested)

```bash
# Download audio
pi-tube dl "https://youtube.com/watch?v=VIDEO_ID" --audio

# Download video
pi-tube dl "https://youtube.com/watch?v=VIDEO_ID" --video
```

---

## Provider comparison

| Provider | Model | Speed | Best for |
|----------|-------|-------|----------|
| groq | Whisper Large V3 Turbo | Fast | General use |
| deepgram | Nova 3 | Very Fast | High accuracy |

## Output

Transcriptions are saved to `~/pi-tube/YYYY-MM-DD-<video_name>.md` by default.
Use `-o` to specify a custom output path.

**Smart Skip**: If the transcription file already exists, the tool will skip download and transcription automatically.

Temporary files are stored in `~/pi-tube/.tmp/` and cleaned up automatically.

## Update

To update pi-tube to the latest version:

```bash
pipx upgrade pi-tube
```

Or run the install script again:

```bash
curl -fsSL https://raw.githubusercontent.com/Lag0/pi-tube/master/install.sh | bash
```
