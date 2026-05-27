import { readFileSync } from "node:fs";
import type { HelpDocument } from "./help-renderer.ts";

export const COMMAND_IDENTITY = "pi-tube";

const PACKAGE_JSON_URL = new URL("../../package.json", import.meta.url);
const PACKAGE_JSON = JSON.parse(readFileSync(PACKAGE_JSON_URL, "utf8")) as { version?: string };
export const APP_VERSION = typeof PACKAGE_JSON.version === "string" ? PACKAGE_JSON.version : "0.0.0";

export type HelpTopic = "root" | "transcribe" | "download" | "auth" | "defaults" | "setup";

const ROOT_HELP_DOCUMENT: HelpDocument = {
  title: `${COMMAND_IDENTITY} CLI`,
  summary: "Transcribe and download public media with provider-based AI transcription.",
  usage: [
    `${COMMAND_IDENTITY} transcribe <input> [--provider <deepgram|groq|elevenlabs>] [--language <code>] [--timestamps] [--json]`,
    `${COMMAND_IDENTITY} download <url> [--audio] [--output <dir>]`,
    `${COMMAND_IDENTITY} auth <login|status|logout> [provider]`,
    `${COMMAND_IDENTITY} defaults <provider|language|show> [value]`,
    `${COMMAND_IDENTITY} setup <skills|yt-dlp|mcp> [--global] [--agent <name>] [--yes|--no-prompt]`,
  ],
  commandGroups: [
    {
      title: "Core",
      rows: [
        { term: `${COMMAND_IDENTITY} transcribe <input>`, description: "Transcribe a URL or local media file." },
        { term: `${COMMAND_IDENTITY} download <url>`, description: "Download YouTube/Instagram media." },
      ],
    },
    {
      title: "Account",
      rows: [
        { term: `${COMMAND_IDENTITY} auth login <provider>`, description: "Save a provider API key locally." },
        { term: `${COMMAND_IDENTITY} auth status`, description: "Show provider authentication status." },
        { term: `${COMMAND_IDENTITY} auth logout <provider>`, description: "Remove a stored provider API key." },
      ],
    },
    {
      title: "Defaults",
      rows: [
        { term: `${COMMAND_IDENTITY} defaults provider <provider>`, description: "Set the default transcription provider." },
        { term: `${COMMAND_IDENTITY} defaults language <code>`, description: "Set the default transcription language." },
        { term: `${COMMAND_IDENTITY} defaults show`, description: "Show default preferences." },
      ],
    },
    {
      title: "Setup",
      rows: [
        { term: `${COMMAND_IDENTITY} setup yt-dlp`, description: "Show or run yt-dlp installation guidance." },
        { term: `${COMMAND_IDENTITY} setup skills`, description: "Install the pi-tube agent skill bundle." },
      ],
    },
  ],
  options: [
    { term: "-h, --help", description: "Show help (or scoped help with `help [command]`)." },
    { term: "-v, --version", description: "Show version." },
    { term: "--no-color", description: "Disable ANSI colors in help output." },
  ],
  examples: [
    `${COMMAND_IDENTITY} auth login elevenlabs`,
    `${COMMAND_IDENTITY} auth status`,
    `${COMMAND_IDENTITY} defaults provider elevenlabs`,
    `${COMMAND_IDENTITY} defaults language pt-BR`,
    `${COMMAND_IDENTITY} transcribe "https://youtube.com/watch?v=dQw4w9WgXcQ" --provider elevenlabs`,
    `${COMMAND_IDENTITY} transcribe "./recording.mp3" --timestamps`,
    `${COMMAND_IDENTITY} download "https://youtube.com/watch?v=dQw4w9WgXcQ"`,
    `${COMMAND_IDENTITY} download "https://instagram.com/reel/abc123" --audio`,
    `${COMMAND_IDENTITY} setup yt-dlp`,
  ],
  notes: [
    "Transcription is explicit in v2: use `pi-tube transcribe <input>`.",
    "Provider API keys are stored in `~/.pi-tube/config.json` with restricted file permissions.",
    "Environment variables (`DEEPGRAM_API_KEY`, `GROQ_API_KEY`, `ELEVENLABS_API_KEY`) remain automatic fallbacks.",
    "Successful transcriptions print `[OUTPUT_FILE]` and `[OUTPUT_FILE_URI]`.",
    "Successful downloads print `[DOWNLOAD_FILE]` and `[DOWNLOAD_FILE_URI]`.",
  ],
};

const TRANSCRIBE_HELP_DOCUMENT: HelpDocument = {
  title: `${COMMAND_IDENTITY} transcribe`,
  summary: "Transcribe a URL or local media file.",
  usage: [`${COMMAND_IDENTITY} transcribe <input> [--provider <deepgram|groq|elevenlabs>] [--language <code>] [--timestamps] [--json]`],
  options: [
    { term: "--provider <deepgram|groq|elevenlabs>", description: "Select transcription provider." },
    { term: "--language <code>", description: "Optional language preference." },
    { term: "--timestamps", description: "Include timestamp blocks in transcript output." },
    { term: "--json", description: "Output deterministic JSON format." },
  ],
  examples: [
    `${COMMAND_IDENTITY} transcribe "https://youtube.com/watch?v=dQw4w9WgXcQ"`,
    `${COMMAND_IDENTITY} transcribe "./recording.mp3" --provider elevenlabs --language pt-BR`,
    `${COMMAND_IDENTITY} transcribe "./recording.mp3" --timestamps --json`,
  ],
  notes: ["Use `defaults provider` and `defaults language` to avoid repeating common flags."],
};

const DOWNLOAD_HELP_DOCUMENT: HelpDocument = {
  title: `${COMMAND_IDENTITY} download`,
  summary: "Download public YouTube or Instagram media with yt-dlp.",
  usage: [`${COMMAND_IDENTITY} download <url> [--audio] [--output <dir>]`],
  options: [
    { term: "--audio", description: "Download audio only instead of video." },
    { term: "--output <dir>", description: "Output directory (default: ./downloads)." },
  ],
  examples: [
    `${COMMAND_IDENTITY} download "https://youtube.com/watch?v=dQw4w9WgXcQ"`,
    `${COMMAND_IDENTITY} download "https://youtube.com/watch?v=dQw4w9WgXcQ" --audio`,
    `${COMMAND_IDENTITY} download "https://instagram.com/reel/abc123" --output ./media`,
  ],
  notes: ["Requires `yt-dlp` on PATH.", "Instagram downloads support public URLs only."],
};

const AUTH_HELP_DOCUMENT: HelpDocument = {
  title: `${COMMAND_IDENTITY} auth`,
  summary: "Manage transcription provider API keys.",
  usage: [
    `${COMMAND_IDENTITY} auth login <deepgram|groq|elevenlabs>`,
    `${COMMAND_IDENTITY} auth status`,
    `${COMMAND_IDENTITY} auth logout <deepgram|groq|elevenlabs>`,
  ],
  options: [
    { term: "--key <api_key>", description: "Provide API key non-interactively." },
  ],
  examples: [
    `${COMMAND_IDENTITY} auth login elevenlabs --key sk_...`,
    `${COMMAND_IDENTITY} auth status`,
    `${COMMAND_IDENTITY} auth logout elevenlabs`,
  ],
  notes: [
    "Stored keys are masked in all command output.",
    "Config is written to `~/.pi-tube/config.json` with restricted permissions.",
    "Environment variables remain automatic fallbacks and do not need setup commands.",
  ],
};

const DEFAULTS_HELP_DOCUMENT: HelpDocument = {
  title: `${COMMAND_IDENTITY} defaults`,
  summary: "Manage default transcription preferences.",
  usage: [
    `${COMMAND_IDENTITY} defaults provider <deepgram|groq|elevenlabs>`,
    `${COMMAND_IDENTITY} defaults language <code>`,
    `${COMMAND_IDENTITY} defaults show`,
  ],
  examples: [
    `${COMMAND_IDENTITY} defaults provider elevenlabs`,
    `${COMMAND_IDENTITY} defaults language pt-BR`,
    `${COMMAND_IDENTITY} defaults show`,
  ],
  notes: ["Defaults are stored in the same local config file as auth settings."],
};

const SETUP_HELP_DOCUMENT: HelpDocument = {
  title: `${COMMAND_IDENTITY} setup`,
  summary: "Install and bootstrap helper workflows.",
  usage: [
    `${COMMAND_IDENTITY} setup yt-dlp`,
    `${COMMAND_IDENTITY} setup skills [--global] [--agent <name>] [--yes|--no-prompt]`,
    `${COMMAND_IDENTITY} setup mcp`,
  ],
  commandGroups: [
    {
      title: "Subcommands",
      rows: [
        { term: "yt-dlp", description: "Show or run yt-dlp installation guidance." },
        { term: "skills", description: "Install the pi-tube skill bundle." },
        { term: "mcp", description: "Reserved for follow-up MCP bootstrap release." },
      ],
    },
  ],
  options: [
    { term: "--global, -g", description: "Install skills in global target scope." },
    { term: "--agent <name>, -a <name>", description: "Target a specific agent profile." },
    { term: "--yes, -y", description: "Run supported setup commands non-interactively." },
    { term: "--no-prompt, --non-interactive", description: "Alias for non-interactive setup execution." },
  ],
  examples: [
    `${COMMAND_IDENTITY} setup yt-dlp`,
    `${COMMAND_IDENTITY} setup skills --global --yes`,
  ],
  notes: ["Interactive setup remains the default for humans."],
};

export function getHelpDocument(topic: HelpTopic): HelpDocument {
  if (topic === "transcribe") return TRANSCRIBE_HELP_DOCUMENT;
  if (topic === "download") return DOWNLOAD_HELP_DOCUMENT;
  if (topic === "auth") return AUTH_HELP_DOCUMENT;
  if (topic === "defaults") return DEFAULTS_HELP_DOCUMENT;
  if (topic === "setup") return SETUP_HELP_DOCUMENT;
  return ROOT_HELP_DOCUMENT;
}
