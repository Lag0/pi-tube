import {
  APP_VERSION,
  COMMAND_IDENTITY,
  HELP_COMMAND_ROWS,
  HELP_EXAMPLES,
  HELP_NOTES,
} from "./command-contract.ts";
import { renderHelpDocument, type HelpDocument } from "./help-renderer.ts";
import {
  handleBaselineInput,
  handleConfigCommand,
  handleDeferredCommand,
  handleProviderStatus,
  isDeferredCommand,
  persistBaselineIntakeResult,
} from "./handlers.ts";
import { handleSetupCommand } from "./setup.ts";
import { CliError, formatCliError } from "../errors/cli-errors.ts";
import { isLegacyCommand, throwLegacyCommandGuidance } from "../legacy/compatibility.ts";

type HelpTopic = "root" | "config" | "setup" | "provider-status";

interface ParsedArgs {
  showHelp: boolean;
  showVersion: boolean;
  json: boolean;
  timestamps: boolean;
  noColor: boolean;
  provider?: string;
  language?: string;
  setupGlobal: boolean;
  setupAgent?: string;
  positionals: string[];
}

function buildRootHelpDocument(): HelpDocument {
  return {
    title: `${COMMAND_IDENTITY} CLI`,
    summary: "Deterministic media transcription workflows for humans and automation.",
    usage: [
      `${COMMAND_IDENTITY} <input> [--provider <deepgram|groq>] [--language <code>] [--timestamps] [--json]`,
      `${COMMAND_IDENTITY} setup <install|skills|mcp> [--global] [--agent <name>]`,
      `${COMMAND_IDENTITY} config <set|get|list> [args] [--json]`,
      `${COMMAND_IDENTITY} provider-status [--json]`,
      `${COMMAND_IDENTITY} help [command]`,
    ],
    commandGroups: [
      {
        title: "Core",
        rows: HELP_COMMAND_ROWS.slice(0, 1).map((row) => {
          const [term, ...rest] = row.split(/\s{2,}/);
          return { term: term ?? row, description: rest.join("  ") || "Core transcription input flow." };
        }),
      },
      {
        title: "Setup & Config",
        rows: HELP_COMMAND_ROWS.slice(1, 4).map((row) => {
          const [term, ...rest] = row.split(/\s{2,}/);
          return { term: term ?? row, description: rest.join("  ") || "Subcommand workflow." };
        }),
      },
      {
        title: "Compatibility",
        rows: HELP_COMMAND_ROWS.slice(4).map((row) => {
          const [term, ...rest] = row.split(/\s{2,}/);
          return { term: term ?? row, description: rest.join("  ") || "Legacy compatibility guidance." };
        }),
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
    examples: [...HELP_EXAMPLES],
    notes: [...HELP_NOTES],
  };
}

function buildConfigHelpDocument(): HelpDocument {
  return {
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
}

function buildSetupHelpDocument(): HelpDocument {
  return {
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
    ],
    examples: [
      `${COMMAND_IDENTITY} setup install`,
      `${COMMAND_IDENTITY} setup skills`,
      `${COMMAND_IDENTITY} setup skills --global`,
      `${COMMAND_IDENTITY} setup skills --agent codex`,
    ],
  };
}

function buildProviderStatusHelpDocument(): HelpDocument {
  return {
    title: `${COMMAND_IDENTITY} provider-status`,
    summary: "Read deterministic provider readiness from registry and env values.",
    usage: [
      `${COMMAND_IDENTITY} provider-status [--json]`,
    ],
    options: [
      { term: "--json", description: "Emit provider readiness report as JSON." },
    ],
    examples: [
      `${COMMAND_IDENTITY} provider-status`,
      `${COMMAND_IDENTITY} --json provider-status`,
    ],
  };
}

function renderHelp(topic: HelpTopic, color: boolean): string {
  let helpDocument: HelpDocument;

  if (topic === "config") {
    helpDocument = buildConfigHelpDocument();
  } else if (topic === "setup") {
    helpDocument = buildSetupHelpDocument();
  } else if (topic === "provider-status") {
    helpDocument = buildProviderStatusHelpDocument();
  } else {
    helpDocument = buildRootHelpDocument();
  }

  return renderHelpDocument(helpDocument, { color });
}

function parse(argv: string[]): ParsedArgs {
  if (argv.length === 0) {
    return {
      showHelp: true,
      showVersion: false,
      json: false,
      timestamps: false,
      noColor: false,
      setupGlobal: false,
      positionals: [],
    };
  }

  let showHelp = false;
  let showVersion = false;
  let json = false;
  let timestamps = false;
  let noColor = false;
  let provider: string | undefined;
  let language: string | undefined;
  let setupGlobal = false;
  let setupAgent: string | undefined;
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";

    if (arg === "--help" || arg === "-h") {
      showHelp = true;
      continue;
    }

    if (arg === "--version" || arg === "-v") {
      showVersion = true;
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--timestamps") {
      timestamps = true;
      continue;
    }

    if (arg === "--no-color") {
      noColor = true;
      continue;
    }

    if (arg === "--global" || arg === "-g") {
      setupGlobal = true;
      continue;
    }

    if (arg === "--agent" || arg === "-a" || arg.startsWith("--agent=")) {
      const value =
        arg === "--agent" || arg === "-a" ? argv[index + 1] : arg.slice("--agent=".length).trim();
      if (!value || value.startsWith("-")) {
        throw new CliError("`--agent` requires a value.", {
          code: "CLI_CONTRACT_VIOLATION",
          exitCode: 2,
        });
      }
      setupAgent = value;
      if (arg === "--agent" || arg === "-a") {
        index += 1;
      }
      continue;
    }

    if (arg === "--provider" || arg.startsWith("--provider=")) {
      const value =
        arg === "--provider" ? argv[index + 1] : arg.slice("--provider=".length).trim();
      if (!value || value.startsWith("-")) {
        throw new CliError("`--provider` requires a value (`deepgram` or `groq`).", {
          code: "CLI_CONTRACT_VIOLATION",
          exitCode: 2,
        });
      }
      provider = value;
      if (arg === "--provider") {
        index += 1;
      }
      continue;
    }

    if (arg === "--language" || arg.startsWith("--language=")) {
      const value =
        arg === "--language" ? argv[index + 1] : arg.slice("--language=".length).trim();
      if (!value || value.startsWith("-")) {
        throw new CliError("`--language` requires a language code value.", {
          code: "CLI_CONTRACT_VIOLATION",
          exitCode: 2,
        });
      }
      language = value;
      if (arg === "--language") {
        index += 1;
      }
      continue;
    }

    if (arg.startsWith("-")) {
      throw new CliError(`Unsupported option: \`${arg}\`.`, {
        code: "CLI_CONTRACT_VIOLATION",
        exitCode: 2,
        guidance: [`Run \`${COMMAND_IDENTITY} --help\` to view supported options.`],
      });
    }

    positionals.push(arg);
  }

  return {
    showHelp,
    showVersion,
    json,
    timestamps,
    noColor,
    provider,
    language,
    setupGlobal,
    setupAgent,
    positionals,
  };
}

function resolveHelpTopic(positionals: string[]): HelpTopic {
  const [first, second, ...rest] = positionals;

  if (first === "help") {
    if (rest.length > 0) {
      throw new CliError("`help` accepts at most one command name.", {
        code: "CLI_CONTRACT_VIOLATION",
        exitCode: 2,
      });
    }

    if (!second) {
      return "root";
    }

    if (second === "config" || second === "setup" || second === "provider-status") {
      return second;
    }

    throw new CliError(`Unsupported help topic: \`${second}\`.`, {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: [
        `Supported help topics: ${COMMAND_IDENTITY} help, ${COMMAND_IDENTITY} help config, ${COMMAND_IDENTITY} help setup, ${COMMAND_IDENTITY} help provider-status.`,
      ],
    });
  }

  if (first === "config" || first === "setup" || first === "provider-status") {
    return first;
  }

  return "root";
}

export async function runCli(argv: string[]): Promise<number> {
  try {
    const parsed = parse(argv);
    const [first, ...rest] = parsed.positionals;

    if (parsed.showHelp || first === "help") {
      const helpTopic = resolveHelpTopic(parsed.positionals);
      console.log(renderHelp(helpTopic, !parsed.noColor));
      return 0;
    }

    if (parsed.showVersion) {
      console.log(`${COMMAND_IDENTITY} ${APP_VERSION}`);
      return 0;
    }

    if (!first) {
      throw new CliError("Missing required input.", {
        code: "CLI_CONTRACT_VIOLATION",
        exitCode: 2,
        guidance: [`Run \`${COMMAND_IDENTITY} --help\` for usage.`],
      });
    }

    if (isLegacyCommand(first)) {
      throwLegacyCommandGuidance(first, parsed.json);
    }

    if (isDeferredCommand(first)) {
      handleDeferredCommand(first, parsed.json);
    }

    if (first === "setup") {
      if (parsed.provider || parsed.language || parsed.timestamps || parsed.json) {
        throw new CliError("`setup` does not support `--provider`, `--language`, `--timestamps`, or `--json`.", {
          code: "CLI_CONTRACT_VIOLATION",
          exitCode: 2,
        });
      }

      const [subcommand, ...extraSetupArgs] = rest;
      if (extraSetupArgs.length > 0) {
        throw new CliError("`setup` accepts only one subcommand at a time.", {
          code: "CLI_CONTRACT_VIOLATION",
          exitCode: 2,
        });
      }
      const output = handleSetupCommand(subcommand, {
        global: parsed.setupGlobal,
        agent: parsed.setupAgent,
      });
      if (output) {
        console.log(output);
      }
      return 0;
    }

    if (parsed.setupGlobal || parsed.setupAgent) {
      throw new CliError("`--global` and `--agent` are only valid with `setup`.", {
        code: "CLI_CONTRACT_VIOLATION",
        exitCode: 2,
      });
    }

    if (first === "config") {
      if (parsed.provider || parsed.language || parsed.timestamps) {
        throw new CliError("`config` does not support `--provider`, `--language`, or `--timestamps`.", {
          code: "CLI_CONTRACT_VIOLATION",
          exitCode: 2,
          guidance: ["Use `pi-tube config <set|get|list> ...` without provider/language/timestamp flags."],
        });
      }

      console.log(handleConfigCommand({ args: rest, json: parsed.json }));
      return 0;
    }

    if (first === "provider-status") {
      if (rest.length > 0) {
        throw new CliError("`provider-status` does not accept positional arguments.", {
          code: "CLI_CONTRACT_VIOLATION",
          exitCode: 2,
          guidance: ["Run `pi-tube provider-status` or `pi-tube --json provider-status`."],
        });
      }
      if (parsed.provider || parsed.language || parsed.timestamps) {
        throw new CliError("`provider-status` does not support `--provider`, `--language`, or `--timestamps`.", {
          code: "CLI_CONTRACT_VIOLATION",
          exitCode: 2,
          guidance: ["Use `pi-tube provider-status` for readiness inspection."],
        });
      }

      console.log(handleProviderStatus({ json: parsed.json }));
      return 0;
    }

    const result = await handleBaselineInput({
      input: first,
      json: parsed.json,
      extraPositionals: rest,
      provider: parsed.provider,
      language: parsed.language,
      timestamps: parsed.timestamps,
    });
    const persisted = persistBaselineIntakeResult(result, {
      env: process.env,
      cwd: process.cwd(),
    });
    console.log(`[OUTPUT_FILE] ${persisted.outputPath}`);
    console.log(`[OUTPUT_FILE_URI] ${persisted.outputUri}`);
    return 0;
  } catch (error) {
    const formatted = formatCliError(error);
    console.error(formatted.message);
    return formatted.exitCode;
  }
}
