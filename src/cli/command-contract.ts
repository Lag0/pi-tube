export const COMMAND_IDENTITY = "pi-tube";
export const APP_VERSION = "0.2.0";

export const GLOBAL_FLAGS = ["--help", "--version", "--json", "--provider", "--language"] as const;

export const HELP_SECTIONS = {
  usage: "Usage",
  commands: "Commands",
  options: "Global options",
  examples: "Examples",
  notes: "Notes",
} as const;

export const HELP_COMMAND_ROWS = [
  `${COMMAND_IDENTITY} <input>              Baseline v1 contract (Phase 4 provider execution active)`,
  `${COMMAND_IDENTITY} youtube <url>        deferred command (use \`pi-tube <input>\`)`,
  `${COMMAND_IDENTITY} instagram <url>      deferred command (use \`pi-tube <input>\`)`,
] as const;

export const HELP_EXAMPLES = [
  `${COMMAND_IDENTITY} \"https://youtube.com/watch?v=dQw4w9WgXcQ\"`,
  `${COMMAND_IDENTITY} --provider deepgram \"https://youtube.com/watch?v=dQw4w9WgXcQ\"`,
  `${COMMAND_IDENTITY} --provider groq --language pt \"./recording.mp3\"`,
  `${COMMAND_IDENTITY} \"https://instagram.com/reel/abc123\"`,
  `${COMMAND_IDENTITY} \"./recording.mp3\"`,
  `${COMMAND_IDENTITY} --json \"https://youtube.com/watch?v=dQw4w9WgXcQ\"`,
] as const;

export const HELP_NOTES = [
  "Core source intake (YouTube/Instagram public/direct URL/local file) is active via `pi-tube <input>`.",
  "Provider execution is active with `--provider deepgram|groq` (default: deepgram).",
  "Language preference is optional via `--language <code>`.",
  "Instagram URLs requiring authentication fail with `INSTAGRAM_AUTH_REQUIRED`.",
  "Provider failures map to stable `TRANSCRIPTION_PROVIDER_*` error codes.",
  "Use `pi-tube --help` to track the stable command contract between phases.",
] as const;
