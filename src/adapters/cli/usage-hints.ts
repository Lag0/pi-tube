/** The usage line printed as the hint when a command is called wrong. */
export function hintForCommand(command: string | undefined): string {
  switch (command) {
    case "transcribe":
      return "Use one of: `pi-tube transcribe <input>`, `pi-tube transcribe <input> --provider <deepgram|groq|elevenlabs>`, `pi-tube transcribe <input> --json`.";
    case "download":
      return "Use one of: `pi-tube download <url>`, `pi-tube download <url> --audio`, `pi-tube download <url> --output <dir>`.";
    case "auth":
      return "Use one of: `pi-tube auth login <deepgram|groq|elevenlabs>`, `pi-tube auth status`, `pi-tube auth logout <deepgram|groq|elevenlabs>`.";
    case "defaults":
      return "Use one of: `pi-tube defaults provider <deepgram|groq|elevenlabs>`, `pi-tube defaults language <code>`, `pi-tube defaults show`.";
    case "config":
      return "Use one of: `pi-tube config list`, `pi-tube config get <key>`, `pi-tube config set <key> <value>`.";
    case "setup":
      return "Use one of: `pi-tube setup yt-dlp`, `pi-tube setup skills`, `pi-tube setup mcp`.";
    default:
      return "Use one of: `pi-tube transcribe <input>`, `pi-tube download <url>`, `pi-tube auth status`, `pi-tube defaults show`, `pi-tube setup yt-dlp`.";
  }
}
