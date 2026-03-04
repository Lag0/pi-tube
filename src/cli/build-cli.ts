import {
  APP_VERSION,
  COMMAND_IDENTITY,
  getHelpDocument,
  type HelpTopic,
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

function renderHelp(topic: HelpTopic, color: boolean): string {
  const helpDocument: HelpDocument = getHelpDocument(topic);
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
