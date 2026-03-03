import { readFileSync } from "node:fs";

export const COMMAND_IDENTITY = "pi-tube";

const PACKAGE_JSON_URL = new URL("../../package.json", import.meta.url);
const PACKAGE_JSON = JSON.parse(readFileSync(PACKAGE_JSON_URL, "utf8")) as { version?: string };
export const APP_VERSION = typeof PACKAGE_JSON.version === "string" ? PACKAGE_JSON.version : "0.0.0";

export const GLOBAL_FLAGS = ["--help", "--version", "--json", "--provider", "--language", "--timestamps"] as const;

export const HELP_SECTIONS = {
  usage: "Usage",
  commands: "Commands",
  options: "Global options",
  examples: "Examples",
  notes: "Notes",
} as const;

export const HELP_COMMAND_ROWS = [
  `${COMMAND_IDENTITY} <input>              Baseline v1 contract (Markdown default, JSON optional)`,
  `${COMMAND_IDENTITY} setup <...>          setup/install helpers for npm + skills`,
  `${COMMAND_IDENTITY} config <set|get|list> deterministic provider/default configuration`,
  `${COMMAND_IDENTITY} provider-status      deterministic provider readiness report`,
  `${COMMAND_IDENTITY} youtube <url>        deferred command (use \`pi-tube <input>\`)`,
  `${COMMAND_IDENTITY} instagram <url>      deferred command (use \`pi-tube <input>\`)`,
] as const;

export const HELP_EXAMPLES = [
  `${COMMAND_IDENTITY} "https://youtube.com/watch?v=dQw4w9WgXcQ"`,
  `${COMMAND_IDENTITY} --provider deepgram "https://youtube.com/watch?v=dQw4w9WgXcQ"`,
  `${COMMAND_IDENTITY} --provider groq --language pt "./recording.mp3"`,
  `${COMMAND_IDENTITY} --timestamps "https://youtube.com/watch?v=dQw4w9WgXcQ"`,
  `${COMMAND_IDENTITY} "https://instagram.com/reel/abc123"`,
  `${COMMAND_IDENTITY} "./recording.mp3"`,
  `${COMMAND_IDENTITY} --json "https://youtube.com/watch?v=dQw4w9WgXcQ"`,
  `${COMMAND_IDENTITY} setup install`,
  `${COMMAND_IDENTITY} setup skills --dry-run`,
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
  "Timestamp blocks are optional via `--timestamps` (default: off).",
  "Successful runs now return deterministic Markdown with YAML frontmatter + fixed summary format.",
  "Use `--json` to emit deterministic schema-versioned JSON from the same canonical artifact.",
  "Provider/language precedence is CLI flags > config defaults > env defaults.",
  "Use `setup install` for npm install commands and `setup skills` to install the repo skill bundle.",
  "Use `config` to set deterministic provider defaults and credential key references.",
  "Use `provider-status` to inspect registered providers and missing credential env vars.",
  "Instagram URLs requiring authentication fail with `INSTAGRAM_AUTH_REQUIRED`.",
  "Provider failures map to stable `TRANSCRIPTION_PROVIDER_*` error codes.",
  "Use `pi-tube --help` to track the stable command contract between phases.",
] as const;
