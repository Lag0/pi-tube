import { readFileSync } from "node:fs";
import { PRICE_TABLE_DATE } from "../../core/index.ts";
import type { HelpDocument } from "./help-renderer.ts";

export const COMMAND_IDENTITY = "pi-tube";

const PACKAGE_JSON_URL = new URL("../../../package.json", import.meta.url);
const PACKAGE_JSON = JSON.parse(readFileSync(PACKAGE_JSON_URL, "utf8")) as { version?: string };
export const APP_VERSION = typeof PACKAGE_JSON.version === "string" ? PACKAGE_JSON.version : "0.0.0";

export type HelpTopic =
  | "root"
  | "transcribe"
  | "info"
  | "library"
  | "audit"
  | "download"
  | "providers"
  | "doctor"
  | "auth"
  | "defaults"
  | "config"
  | "setup";

/** Topics accepted by `pi-tube help <topic>` and `pi-tube <topic> --help`. */
export const HELP_TOPICS: readonly HelpTopic[] = [
  "transcribe",
  "info",
  "library",
  "audit",
  "download",
  "providers",
  "doctor",
  "auth",
  "defaults",
  "config",
  "setup",
];

const ROOT_HELP_DOCUMENT: HelpDocument = {
  title: `${COMMAND_IDENTITY} CLI`,
  summary: "Transcribe and download public media with provider-based AI transcription.",
  usage: [
    `${COMMAND_IDENTITY} transcribe <input> [--provider <deepgram|groq|elevenlabs>] [--language <code>] [--force] [--json]`,
    `${COMMAND_IDENTITY} info <input> [--json]`,
    `${COMMAND_IDENTITY} library <list|show|search> [args] [--json]`,
    `${COMMAND_IDENTITY} audit [list|stats] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--json]`,
    `${COMMAND_IDENTITY} download <url> [--audio] [--output <dir>]`,
    `${COMMAND_IDENTITY} providers [--json]`,
    `${COMMAND_IDENTITY} doctor [--json]`,
    `${COMMAND_IDENTITY} auth <login|status|logout> [provider]`,
    `${COMMAND_IDENTITY} defaults <provider|language|show> [value]`,
    `${COMMAND_IDENTITY} config <list|get|set> [key] [value] [--json]`,
    `${COMMAND_IDENTITY} setup <skills|yt-dlp|mcp> [--global] [--agent <name>] [--yes|--no-prompt]`,
  ],
  commandGroups: [
    {
      title: "Core",
      rows: [
        { term: `${COMMAND_IDENTITY} transcribe <input>`, description: "Transcribe a URL or local media file." },
        {
          term: `${COMMAND_IDENTITY} library list`,
          description: "List the transcripts saved in the local library.",
        },
        {
          term: `${COMMAND_IDENTITY} audit`,
          description: "List the local audit log; `audit stats` sums operations, errors and estimated cost.",
        },
        {
          term: `${COMMAND_IDENTITY} info <input>`,
          description: "Show media metadata (title, platform, date, duration, chapters) without transcribing.",
        },
        { term: `${COMMAND_IDENTITY} download <url>`, description: "Download media from a page yt-dlp supports." },
      ],
    },
    {
      title: "Account",
      rows: [
        {
          term: `${COMMAND_IDENTITY} providers`,
          description: "Show which providers have an API key and where it comes from.",
        },
        { term: `${COMMAND_IDENTITY} auth login <provider>`, description: "Save a provider API key locally." },
        { term: `${COMMAND_IDENTITY} auth status`, description: "Same as `providers`." },
        { term: `${COMMAND_IDENTITY} auth logout <provider>`, description: "Remove a stored provider API key." },
      ],
    },
    {
      title: "Defaults",
      rows: [
        {
          term: `${COMMAND_IDENTITY} defaults provider <provider>`,
          description: "Set the default transcription provider.",
        },
        {
          term: `${COMMAND_IDENTITY} defaults language <code>`,
          description: "Set the default transcription language.",
        },
        { term: `${COMMAND_IDENTITY} defaults show`, description: "Show default preferences." },
        { term: `${COMMAND_IDENTITY} config list`, description: "Show every config value." },
      ],
    },
    {
      title: "Setup",
      rows: [
        {
          term: `${COMMAND_IDENTITY} doctor [--json]`,
          description: "Check the config, provider keys, yt-dlp, ffmpeg, cookies and the library.",
        },
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
    `${COMMAND_IDENTITY} transcribe "./recording.mp3" --force`,
    `${COMMAND_IDENTITY} download "https://youtube.com/watch?v=dQw4w9WgXcQ"`,
    `${COMMAND_IDENTITY} download "https://instagram.com/reel/abc123" --audio`,
    `${COMMAND_IDENTITY} setup yt-dlp`,
  ],
  notes: [
    "Transcription is explicit in v2: use `pi-tube transcribe <input>`.",
    "Provider API keys are stored in `~/.pi-tube/config.json` with restricted file permissions.",
    "Environment variables (`DEEPGRAM_API_KEY`, `GROQ_API_KEY`, `ELEVENLABS_API_KEY`) take precedence over stored keys.",
    "Successful transcriptions print `[OUTPUT_FILE]` and `[OUTPUT_FILE_URI]`.",
    "Successful downloads print `[DOWNLOAD_FILE]` and `[DOWNLOAD_FILE_URI]`.",
  ],
};

const TRANSCRIBE_HELP_DOCUMENT: HelpDocument = {
  title: `${COMMAND_IDENTITY} transcribe`,
  summary: "Transcribe a URL or local media file.",
  usage: [
    `${COMMAND_IDENTITY} transcribe <input> [--provider <deepgram|groq|elevenlabs>] [--language <code>] [--force] [--json]`,
  ],
  options: [
    { term: "--provider <deepgram|groq|elevenlabs>", description: "Select transcription provider." },
    { term: "--language <code>", description: "Optional language preference." },
    { term: "--force", description: "Transcribe again even when the library already has this transcript." },
    { term: "--timestamps", description: "Accepted for compatibility; transcripts always keep their timestamps." },
    { term: "--json", description: "Print the result as JSON on stdout and save the transcript as JSON." },
  ],
  examples: [
    `${COMMAND_IDENTITY} transcribe "https://youtube.com/watch?v=dQw4w9WgXcQ"`,
    `${COMMAND_IDENTITY} transcribe "./recording.mp3" --provider elevenlabs --language pt-BR`,
    `${COMMAND_IDENTITY} transcribe "./recording.mp3" --json`,
  ],
  notes: ["Use `defaults provider` and `defaults language` to avoid repeating common flags."],
};

const INFO_HELP_DOCUMENT: HelpDocument = {
  title: `${COMMAND_IDENTITY} info`,
  summary: "Show media metadata (title, platform, date, duration, chapters) without transcribing.",
  usage: [`${COMMAND_IDENTITY} info <input> [--json]`],
  options: [{ term: "--json", description: "Print the media info as JSON on stdout, with the full description." }],
  examples: [
    `${COMMAND_IDENTITY} info "https://youtube.com/watch?v=dQw4w9WgXcQ"`,
    `${COMMAND_IDENTITY} info "https://vimeo.com/76979871" --json`,
  ],
  notes: [
    "`tier` is `tested` for YouTube, Instagram, direct media URLs and local files, and `best_effort` for any other site.",
    "A live stream that has not ended is reported with its `live_status`; `transcribe` and `download` refuse it.",
  ],
};

const LIBRARY_HELP_DOCUMENT: HelpDocument = {
  title: `${COMMAND_IDENTITY} library`,
  summary:
    "The local library: every transcript pi-tube saved, by source, provider, model and language, and the audio kept for reuse.",
  usage: [
    `${COMMAND_IDENTITY} library list [--limit <n>] [--offset <n>] [filters] [--json]`,
    `${COMMAND_IDENTITY} library show <transcript_id> [--json]`,
    `${COMMAND_IDENTITY} library search <query> [--limit <n>] [--offset <n>] [filters] [--json]`,
    `${COMMAND_IDENTITY} library prune [--older-than <days>] [--include-transcripts] [--yes] [--json]`,
    `${COMMAND_IDENTITY} library import [--json]`,
  ],
  options: [
    { term: "--limit <n>", description: "How many entries to print (default 20, at most 500)." },
    { term: "--offset <n>", description: "How many entries to skip (default 0)." },
    { term: "--provider <id>", description: "list, search: only transcripts made with this provider." },
    {
      term: "--source <kind>",
      description: "list, search: only this source kind (youtube, instagram, site, direct_url, local_file).",
    },
    { term: "--since <YYYY-MM-DD>", description: "list, search: only transcripts made on or after this UTC day." },
    { term: "--until <YYYY-MM-DD>", description: "list, search: only transcripts made on or before this UTC day." },
    { term: "--older-than <days>", description: "prune: only audio, or sources, older than this many days." },
    {
      term: "--include-transcripts",
      description: "prune: delete whole sources, transcripts included (needs --older-than).",
    },
    { term: "--yes", description: "prune: delete; without it, prune only reports what it would delete." },
    { term: "--json", description: "Print the result as JSON on stdout." },
  ],
  examples: [
    `${COMMAND_IDENTITY} library list`,
    `${COMMAND_IDENTITY} library prune --older-than 30 --yes`,
    `${COMMAND_IDENTITY} library search "aula penal"`,
    `${COMMAND_IDENTITY} library list --provider groq --since 2026-10-01 --json`,
    `${COMMAND_IDENTITY} library show 0123456789abcdef0123 --json`,
  ],
  notes: [
    "Search matches names (title, file name or URL, platform), not the transcript text; it ignores case and accents.",
    "The library lives in ~/.pi-tube/library, or PI_TUBE_LIBRARY_DIR.",
    "Audio is kept for reuse (library.keep_audio) and capped by library.max_audio_bytes; transcripts are never deleted automatically.",
    "Transcripts pi-tube v2 saved in ~/.pi-tube (and PI_TUBE_OUTPUT_DIR) are imported once, before the first `transcribe` or `library` command; the originals are never changed. `library import` runs it again.",
  ],
};

const AUDIT_HELP_DOCUMENT: HelpDocument = {
  title: `${COMMAND_IDENTITY} audit`,
  summary:
    "The local audit log: one record per transcribe, download, info and library prune, with its estimated cost. It never leaves your machine.",
  usage: [
    `${COMMAND_IDENTITY} audit [list] [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--operation <name>] [--provider <id>] [--errors] [--limit <n>] [--offset <n>] [--json]`,
    `${COMMAND_IDENTITY} audit stats [--since YYYY-MM-DD] [--until YYYY-MM-DD] [--json]`,
  ],
  options: [
    { term: "--since <YYYY-MM-DD>", description: "Only operations on or after this day (UTC)." },
    { term: "--until <YYYY-MM-DD>", description: "Only operations on or before this day (UTC)." },
    { term: "--operation <name>", description: "list: transcribe, download, info or library_prune." },
    { term: "--provider <id>", description: "list: only this provider." },
    { term: "--errors", description: "list: only failed operations." },
    { term: "--limit <n>", description: "list: how many records to print (default 20, at most 500)." },
    { term: "--offset <n>", description: "list: how many records to skip (default 0)." },
    { term: "--json", description: "Print the result as JSON on stdout." },
  ],
  examples: [
    `${COMMAND_IDENTITY} audit`,
    `${COMMAND_IDENTITY} audit --errors --since 2026-10-01`,
    `${COMMAND_IDENTITY} audit stats --since 2026-10-01 --until 2026-10-31`,
  ],
  notes: [
    `Costs are estimates from the price table of ${PRICE_TABLE_DATE}; your provider bills on its own terms. A cache hit costs 0.`,
    "The log lives in ~/.pi-tube/audit, one file per month; audit.retention_months (default 12) sets how many months are kept.",
    "It never holds API keys, cookies, transcript text or signed URLs; a local file is recorded by its name only.",
  ],
};

const DOWNLOAD_HELP_DOCUMENT: HelpDocument = {
  title: `${COMMAND_IDENTITY} download`,
  summary: "Download the video or audio of a page yt-dlp supports.",
  usage: [`${COMMAND_IDENTITY} download <url> [--audio] [--output <dir>]`],
  options: [
    { term: "--audio", description: "Download audio only instead of video." },
    { term: "--output <dir>", description: "Output directory (default: ~/.pi-tube/downloads)." },
    { term: "--json", description: "Print the result as JSON on stdout." },
  ],
  examples: [
    `${COMMAND_IDENTITY} download "https://youtube.com/watch?v=dQw4w9WgXcQ"`,
    `${COMMAND_IDENTITY} download "https://youtube.com/watch?v=dQw4w9WgXcQ" --audio`,
    `${COMMAND_IDENTITY} download "https://instagram.com/reel/abc123" --output ./media`,
  ],
  notes: [
    "Requires `yt-dlp` on PATH.",
    "YouTube and Instagram are tested; any other site yt-dlp supports is best-effort.",
    "Direct media URLs and local files are not downloaded: they are already files.",
  ],
};

const AUTH_HELP_DOCUMENT: HelpDocument = {
  title: `${COMMAND_IDENTITY} auth`,
  summary: "Manage transcription provider API keys.",
  usage: [
    `${COMMAND_IDENTITY} auth login <deepgram|groq|elevenlabs> [--stdin] [--json]`,
    `${COMMAND_IDENTITY} auth status [--json]`,
    `${COMMAND_IDENTITY} auth logout <deepgram|groq|elevenlabs> [--json]`,
  ],
  options: [
    { term: "--stdin", description: "Read the API key from stdin instead of the hidden prompt." },
    { term: "--json", description: "Output deterministic JSON format." },
  ],
  examples: [
    `${COMMAND_IDENTITY} auth login elevenlabs`,
    `printf '%s' "$GROQ_API_KEY" | ${COMMAND_IDENTITY} auth login groq --stdin`,
    `${COMMAND_IDENTITY} auth status`,
    `${COMMAND_IDENTITY} auth logout elevenlabs`,
  ],
  notes: [
    "API keys are never accepted as arguments, so they stay out of shell history and process lists.",
    "API keys are never printed; `pi-tube providers` shows where each key comes from.",
    "Config is written to `~/.pi-tube/config.json` with restricted permissions.",
    "Environment variables take precedence over stored keys and need no setup command.",
  ],
};

const PROVIDERS_HELP_DOCUMENT: HelpDocument = {
  title: `${COMMAND_IDENTITY} providers`,
  summary: "Show which providers have an API key and where it comes from.",
  usage: [`${COMMAND_IDENTITY} providers [--json]`],
  options: [{ term: "--json", description: "Output deterministic JSON format." }],
  examples: [`${COMMAND_IDENTITY} providers`, `${COMMAND_IDENTITY} providers --json`],
  notes: [
    "`key_source` is `env`, `config` or `none`; an env var wins over a stored key.",
    "Keys are never printed, not even masked.",
  ],
};

const DOCTOR_HELP_DOCUMENT: HelpDocument = {
  title: `${COMMAND_IDENTITY} doctor`,
  summary: "Check the config, provider keys, yt-dlp, ffmpeg, cookies and the library, without network calls.",
  usage: [`${COMMAND_IDENTITY} doctor [--json]`],
  options: [{ term: "--json", description: "Print the report as JSON on stdout." }],
  examples: [`${COMMAND_IDENTITY} doctor`, `${COMMAND_IDENTITY} doctor --json`],
  notes: [
    "Each check is `ok`, `warn` or `error`, with a fix when it is not ok; the report is ok when no check is an error.",
    "It exits 0 even when a check is an error. Keys and the cookies file path are never printed.",
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

const CONFIG_HELP_DOCUMENT: HelpDocument = {
  title: `${COMMAND_IDENTITY} config`,
  summary: "Read and change config values.",
  usage: [
    `${COMMAND_IDENTITY} config list [--json]`,
    `${COMMAND_IDENTITY} config get <key> [--json]`,
    `${COMMAND_IDENTITY} config set <key> <value> [--json]`,
  ],
  options: [{ term: "--json", description: "Output deterministic JSON format." }],
  examples: [
    `${COMMAND_IDENTITY} config list`,
    `${COMMAND_IDENTITY} config set defaults.provider groq`,
    `${COMMAND_IDENTITY} config set providers.groq.api_key_env MY_GROQ_KEY`,
  ],
  notes: [
    "Keys: `defaults.provider`, `defaults.language` and `providers.<id>.api_key_env`.",
    "`audit.retention_months`: months of audit log kept, 12 by default; older months are deleted.",
    "`mcp.max_full_chars`: most characters the MCP tool `get_transcript` returns with `full: true`, 100000 by default.",
    "API keys are not config values: store one with `pi-tube auth login <provider>`.",
  ],
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
  examples: [`${COMMAND_IDENTITY} setup yt-dlp`, `${COMMAND_IDENTITY} setup skills --global --yes`],
  notes: ["Interactive setup remains the default for humans."],
};

export function getHelpDocument(topic: HelpTopic): HelpDocument {
  if (topic === "transcribe") return TRANSCRIBE_HELP_DOCUMENT;
  if (topic === "info") return INFO_HELP_DOCUMENT;
  if (topic === "library") return LIBRARY_HELP_DOCUMENT;
  if (topic === "audit") return AUDIT_HELP_DOCUMENT;
  if (topic === "download") return DOWNLOAD_HELP_DOCUMENT;
  if (topic === "providers") return PROVIDERS_HELP_DOCUMENT;
  if (topic === "doctor") return DOCTOR_HELP_DOCUMENT;
  if (topic === "auth") return AUTH_HELP_DOCUMENT;
  if (topic === "config") return CONFIG_HELP_DOCUMENT;
  if (topic === "defaults") return DEFAULTS_HELP_DOCUMENT;
  if (topic === "setup") return SETUP_HELP_DOCUMENT;
  return ROOT_HELP_DOCUMENT;
}
