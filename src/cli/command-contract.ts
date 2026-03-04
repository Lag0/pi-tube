import { readFileSync } from "node:fs";
import type { HelpDocument } from "./help-renderer.ts";

export const COMMAND_IDENTITY = "pi-tube";

const PACKAGE_JSON_URL = new URL("../../package.json", import.meta.url);
const PACKAGE_JSON = JSON.parse(readFileSync(PACKAGE_JSON_URL, "utf8")) as { version?: string };
export const APP_VERSION = typeof PACKAGE_JSON.version === "string" ? PACKAGE_JSON.version : "0.0.0";

export type HelpTopic = "root" | "config" | "setup" | "provider-status";

const ROOT_HELP_DOCUMENT: HelpDocument = {
  title: `${COMMAND_IDENTITY} CLI`,
  summary: "Deterministic media transcription workflows for humans and automation.",
  usage: [
    `${COMMAND_IDENTITY} <input> [--provider <deepgram|groq>] [--language <code>] [--timestamps] [--json]`,
    `${COMMAND_IDENTITY} help [command]`,
    `${COMMAND_IDENTITY} setup <install|skills|mcp> [--global] [--agent <name>]`,
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
          description: "Deterministic provider/default configuration",
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
    `${COMMAND_IDENTITY} setup install`,
    `${COMMAND_IDENTITY} setup skills`,
    `${COMMAND_IDENTITY} setup skills --global`,
    `${COMMAND_IDENTITY} setup skills --agent codex`,
    `${COMMAND_IDENTITY} "https://youtube.com/watch?v=dQw4w9WgXcQ"  # writes ~/.pi-tube/YYYY-MM-DD-*.md`,
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
    "Use `--json` to emit deterministic schema-versioned JSON from the same canonical artifact.",
    "Provider/language precedence is CLI flags > config defaults > env defaults.",
    "Use `setup install` for npm install commands and `setup skills` to install the repo skill bundle.",
    "`setup skills` follows Firecrawl-style behavior: interactive by default, with optional `--global`/`--agent` targeting.",
    "Use `config` to set deterministic provider defaults and credential key references.",
    "Use `provider-status` to inspect registered providers and missing credential env vars.",
    "Instagram URLs requiring authentication fail with `INSTAGRAM_AUTH_REQUIRED`.",
    "Provider failures map to stable `TRANSCRIPTION_PROVIDER_*` error codes.",
    "Use `pi-tube --help` to track the stable command contract between phases.",
  ],
};

const CONFIG_HELP_DOCUMENT: HelpDocument = {
  title: `${COMMAND_IDENTITY} config`,
  summary: "Deterministic configuration for provider defaults and credentials.",
  usage: [
    `${COMMAND_IDENTITY} config set <key> <value> [--json]`,
    `${COMMAND_IDENTITY} config get <key> [--json]`,
    `${COMMAND_IDENTITY} config list [--json]`,
  ],
  commandGroups: [
    {
      title: "Actions",
      rows: [
        { term: "set <key> <value>", description: "Write a supported config key." },
        { term: "get <key>", description: "Read one supported config key." },
        { term: "list", description: "List all supported config values." },
      ],
    },
  ],
  options: [
    { term: "--json", description: "Emit deterministic JSON payloads for config output." },
    { term: "--no-color", description: "Disable ANSI colors in help output." },
  ],
  examples: [
    `${COMMAND_IDENTITY} config set defaults.provider groq`,
    `${COMMAND_IDENTITY} config get defaults.provider`,
    `${COMMAND_IDENTITY} config list`,
  ],
  notes: [
    "Supported keys: defaults.provider, defaults.language, providers.deepgram.api_key, providers.deepgram.api_key_env, providers.groq.api_key, providers.groq.api_key_env.",
  ],
};

const SETUP_HELP_DOCUMENT: HelpDocument = {
  title: `${COMMAND_IDENTITY} setup`,
  summary: "Install and bootstrap skill workflows from the CLI.",
  usage: [
    `${COMMAND_IDENTITY} setup install`,
    `${COMMAND_IDENTITY} setup skills [--global] [--agent <name>]`,
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
    { term: "--no-color", description: "Disable ANSI colors in help output." },
  ],
  examples: [
    `${COMMAND_IDENTITY} setup install`,
    `${COMMAND_IDENTITY} setup skills`,
    `${COMMAND_IDENTITY} setup skills --global`,
    `${COMMAND_IDENTITY} setup skills --agent codex`,
  ],
  notes: [
    "Interactive setup remains the default for humans.",
    "Automation should use explicit non-interactive setup flags when available.",
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

  return ROOT_HELP_DOCUMENT;
}
