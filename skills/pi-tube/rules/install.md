---
name: pi-tube-installation
description: |
  Install and verify pi-tube CLI and optional skill setup.
---

# Pi-Tube Installation

## npm Install (Recommended for published package)

```bash
npm install -g @syxs/pi-tube
```

## No-global option

```bash
npx -y @syxs/pi-tube --help
```

## Verify

```bash
pi-tube --version
pi-tube --help
pi-tube help transcribe
pi-tube help auth
pi-tube help setup
```

## Configure credentials and defaults

```bash
pi-tube auth login <deepgram|groq|elevenlabs>
pi-tube auth status
pi-tube defaults provider <deepgram|groq|elevenlabs>
pi-tube defaults language pt-BR
pi-tube defaults show
```

`auth login` stores the raw API key locally in `~/.pi-tube/config.json` and masks it in output. `DEEPGRAM_API_KEY`, `GROQ_API_KEY`, and `ELEVENLABS_API_KEY` remain automatic fallbacks.

## Install skill files into agent environments

```bash
pi-tube setup skills
pi-tube setup skills --global --yes
```

## Optional downloader setup

```bash
pi-tube setup yt-dlp
```
