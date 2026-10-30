# Security Policy

## Supported versions

Security fixes land on the latest minor release of the current major line. Older lines do not receive backports.

| Version | Supported |
| ------- | --------- |
| 2.2.x   | Yes       |
| < 2.2   | No        |

## Reporting a vulnerability

Report vulnerabilities privately through GitHub Private Vulnerability Reporting:

https://github.com/Lag0/pi-tube/security/advisories/new

Do not open a public issue, pull request or discussion for a suspected vulnerability. There is no security e-mail address; the private advisory is the only channel.

Include the pi-tube version, your operating system, the command you ran and the smallest input that reproduces the problem. Never include real API keys or cookies; redact them.

You can expect an initial response within 7 days. We will keep you updated in the advisory until a fix is released or the report is closed, and credit you in the advisory unless you ask otherwise.

## Scope

In scope:

- The pi-tube CLI and everything it ships in the npm package.
- Handling of provider API keys stored in `~/.pi-tube/config.json` and read from the environment.
- How pi-tube spawns and supervises child processes (yt-dlp), including the arguments and environment passed to them.
- Files pi-tube writes to disk (transcripts, temporary media).

Out of scope (report upstream instead):

- Vulnerabilities in yt-dlp itself: https://github.com/yt-dlp/yt-dlp/security
- Vulnerabilities in the transcription providers' services or SDKs (Deepgram, Groq, ElevenLabs).
- Issues that require an attacker who already controls your user account or your pi-tube configuration file.
