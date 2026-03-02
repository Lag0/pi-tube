export const COMMAND_IDENTITY = "pi-tube";
export const APP_VERSION = "0.2.0";

export const GLOBAL_FLAGS = ["--help", "--version", "--json"] as const;

export const HELP_SECTIONS = {
  usage: "Usage",
  commands: "Commands",
  options: "Global options",
  examples: "Examples",
  notes: "Notes",
} as const;

export const HELP_COMMAND_ROWS = [
  `${COMMAND_IDENTITY} <input>              Baseline v1 contract (Phase 3 intake active)`,
  `${COMMAND_IDENTITY} youtube <url>        deferred command (use \`pi-tube <input>\`)`,
  `${COMMAND_IDENTITY} instagram <url>      deferred command (use \`pi-tube <input>\`)`,
  `${COMMAND_IDENTITY} deepgram <input>     coming soon (Phase 4)`,
  `${COMMAND_IDENTITY} groq <input>         coming soon (Phase 4)`,
] as const;

export const HELP_EXAMPLES = [
  `${COMMAND_IDENTITY} \"https://youtube.com/watch?v=dQw4w9WgXcQ\"`,
  `${COMMAND_IDENTITY} \"https://instagram.com/reel/abc123\"`,
  `${COMMAND_IDENTITY} \"./recording.mp3\"`,
  `${COMMAND_IDENTITY} --json \"https://youtube.com/watch?v=dQw4w9WgXcQ\"`,
] as const;

export const HELP_NOTES = [
  "Core source intake (YouTube/Instagram public/direct URL/local file) is active via `pi-tube <input>`.",
  "Instagram URLs requiring authentication fail with `INSTAGRAM_AUTH_REQUIRED`.",
  "Provider execution is deferred to Phase 4 after source intake resolution.",
  "Use `pi-tube --help` to track the stable command contract between phases.",
] as const;
