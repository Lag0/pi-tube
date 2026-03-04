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
pi-tube help config
pi-tube help setup
```

## Configure credentials

```bash
pi-tube config provider set deepgram
pi-tube config provider env deepgram DEEPGRAM_API_KEY
pi-tube config provider env groq GROQ_API_KEY
pi-tube provider-status
```

Legacy compatibility:

```bash
pi-tube config set providers.deepgram.api_key_env DEEPGRAM_API_KEY
pi-tube config set providers.groq.api_key_env GROQ_API_KEY
```

## Install skill files into agent environments

```bash
pi-tube setup skills
pi-tube setup skills --global --yes
```
