---
name: pi-tube
description: CLI for YouTube video download and transcription using cloud AI (Deepgram Nova 3, Groq Whisper)
requirements:
  bins:
    - ffmpeg
    - python3
    - yt-dlp
  env:
    - DEEPGRAM_API_KEY (optional)
    - GROQ_API_KEY (optional)
---

# Pi-Tube - YouTube Transcription CLI

Pi-Tube is a CLI tool for downloading and transcribing YouTube videos using cloud AI models.

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/Lag0/pi-tube/master/install.sh | bash
```

## Configuration

Before using, configure at least one API key:

```bash
# For Deepgram Nova 3
pi-tube config set deepgram YOUR_DEEPGRAM_API_KEY

# For Groq Whisper
pi-tube config set groq YOUR_GROQ_API_KEY

# Verify configuration
pi-tube config show
```

## Commands

### Transcribe YouTube Video

```bash
# Using Deepgram Nova 3
pi-tube deepgram "https://youtube.com/watch?v=VIDEO_ID"

# Using Groq Whisper Large V3 Turbo  
pi-tube groq "https://youtube.com/watch?v=VIDEO_ID"

# Save to specific file
pi-tube deepgram "https://youtube.com/watch?v=VIDEO_ID" -o output.txt

# Specify language
pi-tube groq "https://youtube.com/watch?v=VIDEO_ID" -l pt
```

### Transcribe Local File

```bash
pi-tube deepgram /path/to/video.mp4
pi-tube groq /path/to/audio.mp3 -o transcription.txt
```

### Download Only

```bash
# Download audio (default)
pi-tube dl "https://youtube.com/watch?v=VIDEO_ID"

# Download video
pi-tube dl "https://youtube.com/watch?v=VIDEO_ID" --video
```

### Check Provider Status

```bash
pi-tube providers
```

## Output

Transcriptions are saved as `.txt` files by default in the current directory.
Use `-o` flag to specify custom output path.

## Provider Comparison

| Provider | Model | Speed | Accuracy |
|----------|-------|-------|----------|
| deepgram | Nova 3 | Very Fast | Excellent |
| groq | Whisper Large V3 Turbo | Fast | Excellent |
