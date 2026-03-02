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

export const COMMAND_SURFACE = {
  baseline: `${COMMAND_IDENTITY} <input>`,
} as const;

export const HELP_EXAMPLES = [
  `${COMMAND_IDENTITY} \"https://youtube.com/watch?v=...\"  # coming soon (Phase 2)`,
  `${COMMAND_IDENTITY} \"https://instagram.com/reel/...\"   # coming soon (Phase 3)`,
  `${COMMAND_IDENTITY} \"./local-file.mp3\"                 # coming soon (Phase 2)`,
] as const;

export const HELP_NOTES = [
  "Phase 1 locks the command contract and help UX.",
  "Execution paths are intentionally deferred and currently deterministic placeholders.",
] as const;
