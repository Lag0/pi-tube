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
  `${COMMAND_IDENTITY} <input>              Baseline v1 contract (deterministic placeholder in Phase 1)`,
  `${COMMAND_IDENTITY} youtube <url>        coming soon (Phase 2)`,
  `${COMMAND_IDENTITY} instagram <url>      coming soon (Phase 3)`,
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
  "Source/provider execution is deferred and marked as coming soon.",
  "Current placeholder paths are deterministic and exit non-zero.",
  "Use `pi-tube --help` to track the stable command contract between phases.",
] as const;
