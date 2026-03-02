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
  `${COMMAND_IDENTITY} <input>              Baseline v1 contract (Markdown default, JSON optional)`,
  `${COMMAND_IDENTITY} config <set|get|list> deterministic provider/default configuration`,
  `${COMMAND_IDENTITY} provider-status      deterministic provider readiness report`,
  `${COMMAND_IDENTITY} youtube <url>        deferred command (use \`pi-tube <input>\`)`,
  `${COMMAND_IDENTITY} instagram <url>      deferred command (use \`pi-tube <input>\`)`,
] as const;

export const HELP_EXAMPLES = [
  `${COMMAND_IDENTITY} "https://youtube.com/watch?v=dQw4w9WgXcQ"`,
  `${COMMAND_IDENTITY} --provider deepgram "https://youtube.com/watch?v=dQw4w9WgXcQ"`,
  `${COMMAND_IDENTITY} --provider groq --language pt "./recording.mp3"`,
  `${COMMAND_IDENTITY} "https://instagram.com/reel/abc123"`,
  `${COMMAND_IDENTITY} "./recording.mp3"`,
  `${COMMAND_IDENTITY} --json "https://youtube.com/watch?v=dQw4w9WgXcQ"`,
  `${COMMAND_IDENTITY} config set defaults.provider groq`,
  `${COMMAND_IDENTITY} config set providers.groq.api_key_env GROQ_API_KEY`,
  `${COMMAND_IDENTITY} config list`,
  `${COMMAND_IDENTITY} provider-status`,
  `${COMMAND_IDENTITY} --json provider-status`,
] as const;

export const HELP_NOTES = [
  "Core source intake (YouTube/Instagram public/direct URL/local file) is active via `pi-tube <input>`.",
  "Provider execution is active with `--provider deepgram|groq` (default: deepgram).",
  "Language preference is optional via `--language <code>`.",
  "Successful runs now return deterministic Markdown with YAML frontmatter + fixed summary format.",
  "Use `--json` to emit deterministic schema-versioned JSON from the same canonical artifact.",
  "Provider/language precedence is CLI flags > config defaults > env defaults.",
  "Use `config` to set deterministic provider defaults and credential key references.",
  "Use `provider-status` to inspect registered providers and missing credential env vars.",
  "Instagram URLs requiring authentication fail with `INSTAGRAM_AUTH_REQUIRED`.",
  "Provider failures map to stable `TRANSCRIPTION_PROVIDER_*` error codes.",
  "Use `pi-tube --help` to track the stable command contract between phases.",
] as const;
