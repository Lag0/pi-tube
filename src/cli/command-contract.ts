import { readFileSync } from "node:fs";
import type { HelpDocument } from "./help-renderer.ts";

export const COMMAND_IDENTITY = "pi-tube";

const PACKAGE_JSON_URL = new URL("../../package.json", import.meta.url);
const PACKAGE_JSON = JSON.parse(readFileSync(PACKAGE_JSON_URL, "utf8")) as { version?: string };
export const APP_VERSION = typeof PACKAGE_JSON.version === "string" ? PACKAGE_JSON.version : "0.0.0";

export type HelpTopic = "root" | "config" | "setup" | "provider-status" | "download";

const ROOT_HELP_DOCUMENT: HelpDocument = {
  title: `${COMMAND_IDENTITY} CLI`,
  summary: "Deterministic media transcription workflows for humans and automation.",
  usage: [
    `${COMMAND_IDENTITY} <input> [--provider <deepgram|groq>] [--language <code>] [--timestamps] [--json]`,
    `${COMMAND_IDENTITY} help [command]`,
    `${COMMAND_IDENTITY} setup <install|skills|mcp> [--global] [--agent <name>] [--yes|--no-prompt]`,
    `${COMMAND_IDENTITY} download <url> [--audio] [--output <dir>]`,
    `${COMMAND_IDENTITY} config <set|get|list> [args] [--json]`,
    `${COMMAND_IDENTITY} provider-status [--json]`,
  ],
  commandGroups: [
    {
      title: "Core",
      rows: [
        {
          term: `${COMMAND_IDENTITY} <input>`,
          description: "Baseline v1 contract (Markdown default, JSON optional)",
        },
      ],
    },
    {
      title: "Download",
      rows: [
        {
          term: `${COMMAND_IDENTITY} download <url>`,
          description: "Download YouTube/Instagram media (video+audio by default)",
        },
      ],
    },
    {
      title: "Setup",
      rows: [
        {
          term: `${COMMAND_IDENTITY} setup <install|skills|mcp>`,
          description: "Setup/install helpers for npm + skills",
        },
      ],
    },
    {
      title: "Config",
      rows: [
        {
          term: `${COMMAND_IDENTITY} config <set|get|list>`,
          description: "Deterministic configuration (friendly aliases + legacy compatibility)",
        },
      ],
    },
    {
      title: "Provider",
      rows: [
        {
          term: `${COMMAND_IDENTITY} provider-status`,
          description: "Deterministic provider readiness report",
        },
      ],
    },
    {
      title: "Compatibility",
      rows: [
        {
          term: `${COMMAND_IDENTITY} youtube <url>`,
          description: "Deferred command (use `pi-tube <input>`)",
        },
        {
          term: `${COMMAND_IDENTITY} instagram <url>`,
          description: "Deferred command (use `pi-tube <input>`)",
        },
      ],
    },
  ],
  options: [
    { term: "-h, --help", description: "Show help (or scoped help with `help [command]`)." },
    { term: "-v, --version", description: "Show version." },
    { term: "--json", description: "Output deterministic JSON format." },
    { term: "--provider <deepgram|groq>", description: "Select transcription provider (default: deepgram)." },
    { term: "--language <code>", description: "Optional language preference." },
    { term: "--timestamps", description: "Include timestamp blocks in transcript output." },
    { term: "--audio", description: "Download audio only with `download`." },
    { term: "--output <dir>", description: "Output directory for `download` (default: ./downloads)." },
    { term: "--no-color", description: "Disable ANSI colors in help output." },
  ],
  examples: [
    `${COMMAND_IDENTITY} help`,
    `${COMMAND_IDENTITY} help config`,
    `${COMMAND_IDENTITY} "https://youtube.com/watch?v=dQw4w9WgXcQ"`,
    `${COMMAND_IDENTITY} --provider deepgram "https://youtube.com/watch?v=dQw4w9WgXcQ"`,
    `${COMMAND_IDENTITY} --provider groq --language pt "./recording.mp3"`,
    `${COMMAND_IDENTITY} --timestamps "https://youtube.com/watch?v=dQw4w9WgXcQ"`,
    `${COMMAND_IDENTITY} "https://instagram.com/reel/abc123"`,
    `${COMMAND_IDENTITY} "./recording.mp3"`,
    `${COMMAND_IDENTITY} --json "https://youtube.com/watch?v=dQw4w9WgXcQ"`,
    `${COMMAND_IDENTITY} download "https://youtube.com/watch?v=dQw4w9WgXcQ"`,
    `${COMMAND_IDENTITY} download "https://instagram.com/reel/abc123" --audio`,
    `${COMMAND_IDENTITY} download "https://youtube.com/watch?v=dQw4w9WgXcQ" --output ./downloads`,
    `${COMMAND_IDENTITY} setup install`,
    `${COMMAND_IDENTITY} setup skills`,
    `${COMMAND_IDENTITY} setup skills --global`,
    `${COMMAND_IDENTITY} setup skills --agent codex`,
    `${COMMAND_IDENTITY} setup skills --global --yes`,
    `${COMMAND_IDENTITY} "https://youtube.com/watch?v=dQw4w9WgXcQ"  # writes ~/.pi-tube/YYYY-MM-DD-*.md`,
    `${COMMAND_IDENTITY} config provider set groq`,
    `${COMMAND_IDENTITY} config provider env groq GROQ_API_KEY`,
    `${COMMAND_IDENTITY} config language set pt-BR`,
    `${COMMAND_IDENTITY} config set defaults.provider groq`,
    `${COMMAND_IDENTITY} config set providers.groq.api_key_env GROQ_API_KEY`,
    `${COMMAND_IDENTITY} config list`,
    `${COMMAND_IDENTITY} provider-status`,
    `${COMMAND_IDENTITY} --json provider-status`,
  ],
  notes: [
    "Core source intake (YouTube/Instagram public/direct URL/local file) is active via `pi-tube <input>`.",
    "Provider execution is active with `--provider deepgram|groq` (default: deepgram).",
    "Language preference is optional via `--language <code>`.",
    "Timestamp blocks are optional via `--timestamps` (default: off).",
    "Successful runs now return deterministic Markdown with YAML frontmatter + fixed summary format.",
    "Baseline runs persist output files to `~/.pi-tube/YYYY-MM-DD-<title-or-file>.{md|json}`.",
    "Stdout prints `[OUTPUT_FILE]` and `[OUTPUT_FILE_URI]` so terminals can open the artifact directly.",
    "`download` saves durable media files to `./downloads` by default and prints `[DOWNLOAD_FILE]` plus `[DOWNLOAD_FILE_URI]`.",
    "Use `--json` to emit deterministic schema-versioned JSON from the same canonical artifact.",
    "Provider/language precedence is CLI flags > config defaults > env defaults.",
    "Use `setup install` for npm install commands and `setup skills` to install the repo skill bundle.",
    "`setup skills` follows Firecrawl-style behavior: interactive by default, with optional `--global`/`--agent` targeting.",
    "Use `setup skills --global --yes` (or `--no-prompt`) for non-interactive automation installs.",
    "Use `config` to set deterministic provider defaults and credential key references.",
    "Use `provider-status` to inspect registered providers and missing credential env vars.",
    "Instagram URLs requiring authentication fail with `INSTAGRAM_AUTH_REQUIRED`.",
    "Provider failures map to stable `TRANSCRIPTION_PROVIDER_*` error codes.",
    "Use `pi-tube --help` to track the stable command contract between phases.",
  ],
};

const DOWNLOAD_HELP_DOCUMENT: HelpDocument = {
  title: `${COMMAND_IDENTITY} download`,
  summary: "Download public YouTube or Instagram media with yt-dlp.",
  usage: [
    `${COMMAND_IDENTITY} download <url> [--audio] [--output <dir>]`,
  ],
  commandGroups: [
    {
      title: "Behavior",
      rows: [
        { term: "download <url>", description: "Download video with audio by default." },
        { term: "download <url> --audio", description: "Download audio only as mp3." },
      ],
    },
  ],
  options: [
    { term: "--audio", description: "Download audio only instead of video." },
    { term: "--output <dir>", description: "Output directory (default: ./downloads)." },
    { term: "--no-color", description: "Disable ANSI colors in help output." },
  ],
  examples: [
    `${COMMAND_IDENTITY} download "https://youtube.com/watch?v=dQw4w9WgXcQ"`,
    `${COMMAND_IDENTITY} download "https://youtube.com/watch?v=dQw4w9WgXcQ" --audio`,
    `${COMMAND_IDENTITY} download "https://instagram.com/reel/abc123" --output ./media`,
  ],
  notes: [
    "Requires `yt-dlp` on PATH.",
    "Instagram downloads support public URLs only.",
    "Successful downloads print `[DOWNLOAD_FILE]` and `[DOWNLOAD_FILE_URI]`.",
  ],
};

const CONFIG_HELP_DOCUMENT: HelpDocument = {
  title: `${COMMAND_IDENTITY} config`,
  summary: "Deterministic configuration with friendly aliases and legacy dot-path compatibility.",
  usage: [
    `${COMMAND_IDENTITY} config provider set <deepgram|groq> [--json]`,
    `${COMMAND_IDENTITY} config provider env <deepgram|groq> <ENV_VAR> [--json]`,
    `${COMMAND_IDENTITY} config language set <code> [--json]`,
    `${COMMAND_IDENTITY} config set <key> <value> [--json]`,
    `${COMMAND_IDENTITY} config get <key> [--json]`,
    `${COMMAND_IDENTITY} config list [--json]`,
  ],
  commandGroups: [
    {
      title: "Friendly actions",
      rows: [
        { term: "provider set <deepgram|groq>", description: "Set default provider." },
        { term: "provider get", description: "Read default provider." },
        { term: "provider env <provider> <ENV_VAR>", description: "Set provider API key env var reference." },
        { term: "provider key <provider> <api_key>", description: "Set provider API key directly." },
        { term: "language set <code>", description: "Set default language." },
        { term: "language get", description: "Read default language." },
      ],
    },
    {
      title: "Legacy actions (still supported)",
      rows: [
        { term: "set <key> <value>", description: "Write a supported dot-path config key." },
        { term: "get <key>", description: "Read one dot-path config key." },
        { term: "list", description: "List all supported config values." },
      ],
    },
  ],
  options: [
    { term: "--json", description: "Emit deterministic JSON payloads for config output." },
    { term: "--no-color", description: "Disable ANSI colors in help output." },
  ],
  examples: [
    `${COMMAND_IDENTITY} config provider set groq`,
    `${COMMAND_IDENTITY} config provider env groq GROQ_API_KEY`,
    `${COMMAND_IDENTITY} config language set pt-BR`,
    `${COMMAND_IDENTITY} config set defaults.provider groq`,
    `${COMMAND_IDENTITY} config get defaults.provider`,
    `${COMMAND_IDENTITY} config list`,
  ],
  notes: [
    "Friendly commands write to the same canonical config keys used by legacy scripts.",
    "Legacy `config set/get/list` commands remain supported for automation compatibility.",
    "Supported keys: defaults.provider, defaults.language, providers.deepgram.api_key, providers.deepgram.api_key_env, providers.groq.api_key, providers.groq.api_key_env.",
  ],
};

const SETUP_HELP_DOCUMENT: HelpDocument = {
  title: `${COMMAND_IDENTITY} setup`,
  summary: "Install and bootstrap skill workflows from the CLI.",
  usage: [
    `${COMMAND_IDENTITY} setup install`,
    `${COMMAND_IDENTITY} setup skills [--global] [--agent <name>] [--yes|--no-prompt]`,
    `${COMMAND_IDENTITY} setup mcp`,
  ],
  commandGroups: [
    {
      title: "Subcommands",
      rows: [
        { term: "install", description: "Show package install guidance." },
        { term: "skills", description: "Execute the skills installer command." },
        { term: "mcp", description: "Reserved for follow-up MCP bootstrap release." },
      ],
    },
  ],
  options: [
    { term: "--global, -g", description: "Install skills in global target scope." },
    { term: "--agent <name>, -a <name>", description: "Target a specific agent profile." },
    { term: "--yes, -y", description: "Run setup skills in non-interactive mode." },
    { term: "--no-prompt, --non-interactive", description: "Alias for non-interactive setup execution." },
    { term: "--no-color", description: "Disable ANSI colors in help output." },
  ],
  examples: [
    `${COMMAND_IDENTITY} setup install`,
    `${COMMAND_IDENTITY} setup skills`,
    `${COMMAND_IDENTITY} setup skills --global`,
    `${COMMAND_IDENTITY} setup skills --agent codex`,
    `${COMMAND_IDENTITY} setup skills --global --yes`,
  ],
  notes: [
    "Interactive setup remains the default for humans.",
    "Automation should use explicit non-interactive setup flags (`--yes` or `--no-prompt`).",
  ],
};

const PROVIDER_STATUS_HELP_DOCUMENT: HelpDocument = {
  title: `${COMMAND_IDENTITY} provider-status`,
  summary: "Read deterministic provider readiness from registry and env values.",
  usage: [
    `${COMMAND_IDENTITY} provider-status [--json]`,
  ],
  options: [
    { term: "--json", description: "Emit provider readiness report as JSON." },
    { term: "--no-color", description: "Disable ANSI colors in help output." },
  ],
  examples: [
    `${COMMAND_IDENTITY} provider-status`,
    `${COMMAND_IDENTITY} --json provider-status`,
  ],
};

export function getHelpDocument(topic: HelpTopic): HelpDocument {
  if (topic === "config") {
    return CONFIG_HELP_DOCUMENT;
  }

  if (topic === "setup") {
    return SETUP_HELP_DOCUMENT;
  }

  if (topic === "provider-status") {
    return PROVIDER_STATUS_HELP_DOCUMENT;
  }

  if (topic === "download") {
    return DOWNLOAD_HELP_DOCUMENT;
  }

  return ROOT_HELP_DOCUMENT;
}
