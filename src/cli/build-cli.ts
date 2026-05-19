import { Command, CommanderError } from "commander";
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
  handleDownloadCommand,
  handleProviderStatus,
  isDeferredCommand,
  persistBaselineIntakeResult,
} from "./handlers.ts";
import { handleSetupCommand } from "./setup.ts";
import { CliError, formatCliError } from "../errors/cli-errors.ts";
import { isLegacyCommand, throwLegacyCommandGuidance } from "../legacy/compatibility.ts";
import { createProgressReporter } from "./progress.ts";

interface ParsedArgs {
  showHelp: boolean;
  showVersion: boolean;
  json: boolean;
  timestamps: boolean;
  noColor: boolean;
  provider?: string;
  language?: string;
  setupGlobal: boolean;
  setupNonInteractive: boolean;
  setupAgent?: string;
  downloadAudio: boolean;
  outputDir?: string;
  positionals: string[];
}

function renderHelp(topic: HelpTopic, color: boolean): string {
  const helpDocument: HelpDocument = getHelpDocument(topic);
  return renderHelpDocument(helpDocument, { color });
}

function createProgram(): Command {
  return new Command()
    .name(COMMAND_IDENTITY)
    .description("Deterministic media transcription workflows for humans and automation.")
    .exitOverride()
    .configureOutput({
      writeOut: () => undefined,
      writeErr: () => undefined,
    })
    .allowExcessArguments(true)
    .allowUnknownOption(false)
    .helpOption(false)
    .addHelpCommand(false)
    .argument("[positionals...]", "command or media input")
    .option("-v, --version", "Show version.")
    .option("--json", "Output deterministic JSON format.")
    .option("--provider <provider>", "Select transcription provider (deepgram or groq).")
    .option("--language <code>", "Optional language preference.")
    .option("--timestamps", "Include timestamp blocks in transcript output.")
    .option("--audio", "Download audio only for download command.")
    .option("--output <dir>", "Output directory for download command.")
    .option("--no-color", "Disable ANSI colors in help output.")
    .option("-g, --global", "Use global setup target.")
    .option("-a, --agent <name>", "Select setup agent target.")
    .option("-y, --yes", "Run setup non-interactively.")
    .option("--no-prompt", "Run setup non-interactively.")
    .option("--non-interactive", "Run setup non-interactively.");
}

function isHelpRequest(argv: string[]): boolean {
  return argv.length === 0 || argv.includes("--help") || argv.includes("-h") || argv[0] === "help";
}

function commanderErrorToCliError(error: CommanderError): CliError {
  return new CliError(error.message, {
    code: "CLI_CONTRACT_VIOLATION",
    exitCode: error.exitCode === 0 ? 0 : 2,
    guidance: [`Run \`${COMMAND_IDENTITY} --help\` to view supported options.`],
  });
}

function parse(argv: string[]): ParsedArgs {
  if (isHelpRequest(argv)) {
    const noColor = argv.includes("--no-color");
    const positionals = argv.filter((arg) => !["--help", "-h", "--no-color"].includes(arg));
    return {
      showHelp: true,
      showVersion: false,
      json: false,
      timestamps: false,
      noColor,
      setupGlobal: false,
      setupNonInteractive: false,
      downloadAudio: false,
      positionals,
    };
  }

  const program = createProgram();
  try {
    program.parse(argv, { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) {
      throw commanderErrorToCliError(error);
    }
    throw error;
  }

  const options = program.opts<{
    version?: boolean;
    json?: boolean;
    provider?: string;
    language?: string;
    timestamps?: boolean;
    audio?: boolean;
    output?: string;
    color?: boolean;
    global?: boolean;
    agent?: string;
    yes?: boolean;
    prompt?: boolean;
    nonInteractive?: boolean;
  }>();

  return {
    showHelp: false,
    showVersion: Boolean(options.version),
    json: Boolean(options.json),
    timestamps: Boolean(options.timestamps),
    noColor: options.color === false,
    provider: options.provider,
    language: options.language,
    setupGlobal: Boolean(options.global),
    setupNonInteractive: Boolean(options.yes || options.prompt === false || options.nonInteractive),
    setupAgent: options.agent,
    downloadAudio: Boolean(options.audio),
    outputDir: options.output,
    positionals: program.args.map(String),
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

    if (first === "download") {
      if (parsed.provider || parsed.language || parsed.timestamps || parsed.json) {
        throw new CliError("`download` does not support `--provider`, `--language`, `--timestamps`, or `--json`.", {
          code: "CLI_CONTRACT_VIOLATION",
          exitCode: 2,
          guidance: ["Use `pi-tube download <url> [--audio] [--output <dir>]`."],
        });
      }

      const progress = createProgressReporter({ color: !parsed.noColor });
      const startTime = Date.now();
      try {
        const [downloadInput, ...extraDownloadArgs] = rest;
        const result = await handleDownloadCommand({
          input: downloadInput,
          extraPositionals: extraDownloadArgs,
          audio: parsed.downloadAudio,
          outputDir: parsed.outputDir,
          env: process.env,
          cwd: process.cwd(),
          onProgress: (step) => progress.update(step),
        });
        progress.succeed(result.outputPath, Date.now() - startTime);
        console.log(`[DOWNLOAD_FILE] ${result.outputPath}`);
        console.log(`[DOWNLOAD_FILE_URI] ${result.outputUri}`);
        return 0;
      } catch (error) {
        progress.fail("Failed");
        throw error;
      }
    }

    if (parsed.downloadAudio || parsed.outputDir) {
      throw new CliError("`--audio` and `--output` are only valid with `download`.", {
        code: "CLI_CONTRACT_VIOLATION",
        exitCode: 2,
        guidance: ["Use `pi-tube download <url> [--audio] [--output <dir>]`."],
      });
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
        nonInteractive: parsed.setupNonInteractive,
        agent: parsed.setupAgent,
      });
      if (output) {
        console.log(output);
      }
      return 0;
    }

    if (parsed.setupGlobal || parsed.setupAgent || parsed.setupNonInteractive) {
      throw new CliError("`--global`, `--agent`, `--yes`, and `--no-prompt` are only valid with `setup`.", {
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

    const progress = createProgressReporter({ color: !parsed.noColor });
    const startTime = Date.now();

    try {
      const result = await handleBaselineInput({
        input: first,
        json: parsed.json,
        extraPositionals: rest,
        provider: parsed.provider,
        language: parsed.language,
        timestamps: parsed.timestamps,
        onProgress: (step) => progress.update(step),
      });

      progress.update({ label: "Saving output..." });
      const persisted = persistBaselineIntakeResult(result, {
        env: process.env,
        cwd: process.cwd(),
      });

      progress.succeed(persisted.outputPath, Date.now() - startTime);
      console.log(`[OUTPUT_FILE] ${persisted.outputPath}`);
      console.log(`[OUTPUT_FILE_URI] ${persisted.outputUri}`);
      return 0;
    } catch (error) {
      progress.fail("Failed");
      throw error;
    }
  } catch (error) {
    const formatted = formatCliError(error);
    console.error(formatted.message);
    return formatted.exitCode;
  }
}
