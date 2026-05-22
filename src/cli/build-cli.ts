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
  persistBaselineIntakeResult,
} from "./handlers.ts";
import { handleSetupCommand } from "./setup.ts";
import { CliError, formatCliError } from "../errors/cli-errors.ts";
import { isLegacyCommand, throwLegacyCommandGuidance } from "../legacy/compatibility.ts";
import { createProgressReporter } from "./progress.ts";

type CliAction =
  | { kind: "root"; input?: string; extraPositionals: string[]; options: RootOptions }
  | { kind: "version" }
  | { kind: "help"; positionals: string[]; noColor: boolean }
  | { kind: "download"; input?: string; extraPositionals: string[]; options: DownloadOptions; rootOptions: RootOptions }
  | { kind: "setup"; subcommand?: string; options: SetupCommandOptions; rootOptions: RootOptions }
  | { kind: "config"; args: string[]; options: JsonCommandOptions; rootOptions: RootOptions }
  | { kind: "provider-status"; extraPositionals: string[]; options: JsonCommandOptions; rootOptions: RootOptions }
  | { kind: "deferred"; command: string; rootOptions: RootOptions }
  | { kind: "legacy"; command: string; rootOptions: RootOptions };

interface RootOptions {
  version?: boolean;
  json?: boolean;
  provider?: string;
  language?: string;
  timestamps?: boolean;
  color?: boolean;
}

interface JsonCommandOptions {
  json?: boolean;
}

interface DownloadOptions {
  audio?: boolean;
  output?: string;
}

interface SetupCommandOptions {
  global?: boolean;
  agent?: string;
  yes?: boolean;
  prompt?: boolean;
  nonInteractive?: boolean;
}

function renderHelp(topic: HelpTopic, color: boolean): string {
  const helpDocument: HelpDocument = getHelpDocument(topic);
  return renderHelpDocument(helpDocument, { color });
}

function isHelpRequest(argv: string[]): boolean {
  return argv.length === 0 || argv.includes("--help") || argv.includes("-h") || argv[0] === "help";
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

    if (second === "config" || second === "setup" || second === "provider-status" || second === "download") {
      return second;
    }

    throw new CliError(`Unsupported help topic: \`${second}\`.`, {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: [
        `Supported help topics: ${COMMAND_IDENTITY} help, ${COMMAND_IDENTITY} help config, ${COMMAND_IDENTITY} help setup, ${COMMAND_IDENTITY} help provider-status, ${COMMAND_IDENTITY} help download.`,
      ],
    });
  }

  if (first === "config" || first === "setup" || first === "provider-status" || first === "download") {
    return first;
  }

  return "root";
}

function commanderErrorToCliError(error: CommanderError): CliError {
  return new CliError(error.message, {
    code: "CLI_CONTRACT_VIOLATION",
    exitCode: error.exitCode === 0 ? 0 : 2,
    guidance: [`Run \`${COMMAND_IDENTITY} --help\` to view supported options.`],
  });
}

function createProgram(setAction: (action: CliAction) => void): Command {
  const program = new Command()
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
    .argument("[input]", "media input")
    .argument("[extraPositionals...]", "extra media inputs")
    .option("-v, --version", "Show version.")
    .option("--json", "Output deterministic JSON format.")
    .option("--provider <provider>", "Select transcription provider (deepgram or groq).")
    .option("--language <code>", "Optional language preference.")
    .option("--timestamps", "Include timestamp blocks in transcript output.")
    .option("--no-color", "Disable ANSI colors in help output.")
    .action((input: string | undefined, extraPositionals: string[]) => {
      const options = program.opts<RootOptions>();
      if (options.version) {
        setAction({ kind: "version" });
        return;
      }

      if (input && isLegacyCommand(input)) {
        setAction({ kind: "legacy", command: input, rootOptions: options });
        return;
      }

      setAction({ kind: "root", input, extraPositionals, options });
    });

  program
    .command("download")
    .description("Download YouTube/Instagram media.")
    .argument("[input]", "YouTube or Instagram URL")
    .argument("[extraPositionals...]", "extra URL inputs")
    .option("--audio", "Download audio only.")
    .option("--output <dir>", "Output directory.")
    .action((input: string | undefined, extraPositionals: string[], options: DownloadOptions) => {
      setAction({ kind: "download", input, extraPositionals, options, rootOptions: program.opts<RootOptions>() });
    });

  program
    .command("setup")
    .description("Install and bootstrap helper workflows.")
    .argument("[subcommand]", "install, skills, yt-dlp, or mcp")
    .option("-g, --global", "Use global setup target.")
    .option("-a, --agent <name>", "Select setup agent target.")
    .option("-y, --yes", "Run setup non-interactively.")
    .option("--no-prompt", "Run setup non-interactively.")
    .option("--non-interactive", "Run setup non-interactively.")
    .action((subcommand: string | undefined, options: SetupCommandOptions) => {
      setAction({ kind: "setup", subcommand, options, rootOptions: program.opts<RootOptions>() });
    });

  program
    .command("config")
    .description("Read and write deterministic configuration.")
    .argument("[args...]", "config action and arguments")
    .option("--json", "Emit deterministic JSON output.")
    .action((args: string[], options: JsonCommandOptions) => {
      setAction({ kind: "config", args, options, rootOptions: program.opts<RootOptions>() });
    });

  program
    .command("provider-status")
    .description("Read deterministic provider readiness.")
    .argument("[extraPositionals...]", "unexpected arguments")
    .option("--json", "Emit provider readiness as JSON.")
    .action((extraPositionals: string[], options: JsonCommandOptions) => {
      setAction({ kind: "provider-status", extraPositionals, options, rootOptions: program.opts<RootOptions>() });
    });

  for (const command of ["youtube", "instagram"]) {
    program
      .command(command)
      .description("Deferred compatibility command.")
      .argument("[args...]", "deferred command arguments")
      .action(() => {
        setAction({ kind: "deferred", command, rootOptions: program.opts<RootOptions>() });
      });
  }

  return program;
}

function parseAction(argv: string[]): CliAction {
  if (isHelpRequest(argv)) {
    const noColor = argv.includes("--no-color");
    const positionals = argv.filter((arg) => !["--help", "-h", "--no-color"].includes(arg));
    return { kind: "help", positionals, noColor };
  }

  let action: CliAction | undefined;
  const program = createProgram((nextAction) => {
    action = nextAction;
  });

  try {
    program.parse(argv, { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) {
      throw commanderErrorToCliError(error);
    }
    throw error;
  }

  return action ?? { kind: "root", input: undefined, extraPositionals: [], options: program.opts<RootOptions>() };
}

function hasTranscriptionOnlyOptions(options: RootOptions): boolean {
  return Boolean(options.provider || options.language || options.timestamps);
}

function resolveJsonOption(commandOptions: JsonCommandOptions, rootOptions: RootOptions): boolean {
  return Boolean(commandOptions.json || rootOptions.json);
}

async function runDownloadAction(action: Extract<CliAction, { kind: "download" }>): Promise<number> {
  if (hasTranscriptionOnlyOptions(action.rootOptions) || action.rootOptions.json) {
    throw new CliError("`download` does not support `--provider`, `--language`, `--timestamps`, or `--json`.", {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: ["Use `pi-tube download <url> [--audio] [--output <dir>]`."],
    });
  }

  const progress = createProgressReporter({ color: action.rootOptions.color !== false });
  const startTime = Date.now();
  try {
    const result = await handleDownloadCommand({
      input: action.input,
      extraPositionals: action.extraPositionals,
      audio: Boolean(action.options.audio),
      outputDir: action.options.output,
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

function runSetupAction(action: Extract<CliAction, { kind: "setup" }>): number {
  if (hasTranscriptionOnlyOptions(action.rootOptions) || action.rootOptions.json) {
    throw new CliError("`setup` does not support `--provider`, `--language`, `--timestamps`, or `--json`.", {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
    });
  }

  const output = handleSetupCommand(action.subcommand, {
    global: action.options.global,
    nonInteractive: Boolean(action.options.yes || action.options.prompt === false || action.options.nonInteractive),
    agent: action.options.agent,
  });
  if (output) {
    console.log(output);
  }
  return 0;
}

function runConfigAction(action: Extract<CliAction, { kind: "config" }>): number {
  if (hasTranscriptionOnlyOptions(action.rootOptions)) {
    throw new CliError("`config` does not support `--provider`, `--language`, or `--timestamps`.", {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: ["Use `pi-tube config <set|get|list> ...` without provider/language/timestamp flags."],
    });
  }

  console.log(handleConfigCommand({ args: action.args, json: resolveJsonOption(action.options, action.rootOptions) }));
  return 0;
}

function runProviderStatusAction(action: Extract<CliAction, { kind: "provider-status" }>): number {
  if (action.extraPositionals.length > 0) {
    throw new CliError("`provider-status` does not accept positional arguments.", {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: ["Run `pi-tube provider-status` or `pi-tube --json provider-status`."],
    });
  }
  if (hasTranscriptionOnlyOptions(action.rootOptions)) {
    throw new CliError("`provider-status` does not support `--provider`, `--language`, or `--timestamps`.", {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: ["Use `pi-tube provider-status` for readiness inspection."],
    });
  }

  console.log(handleProviderStatus({ json: resolveJsonOption(action.options, action.rootOptions) }));
  return 0;
}

async function runRootAction(action: Extract<CliAction, { kind: "root" }>): Promise<number> {
  if (!action.input) {
    throw new CliError("Missing required input.", {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: [`Run \`${COMMAND_IDENTITY} --help\` for usage.`],
    });
  }

  const progress = createProgressReporter({ color: action.options.color !== false });
  const startTime = Date.now();

  try {
    const result = await handleBaselineInput({
      input: action.input,
      json: Boolean(action.options.json),
      extraPositionals: action.extraPositionals,
      provider: action.options.provider,
      language: action.options.language,
      timestamps: Boolean(action.options.timestamps),
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
}

export async function runCli(argv: string[]): Promise<number> {
  try {
    const action = parseAction(argv);

    switch (action.kind) {
      case "help": {
        const helpTopic = resolveHelpTopic(action.positionals);
        console.log(renderHelp(helpTopic, !action.noColor));
        return 0;
      }
      case "version":
        console.log(`${COMMAND_IDENTITY} ${APP_VERSION}`);
        return 0;
      case "legacy":
        throwLegacyCommandGuidance(action.command, Boolean(action.rootOptions.json));
      case "deferred":
        handleDeferredCommand(action.command, Boolean(action.rootOptions.json));
        return 0;
      case "download":
        return await runDownloadAction(action);
      case "setup":
        return runSetupAction(action);
      case "config":
        return runConfigAction(action);
      case "provider-status":
        return runProviderStatusAction(action);
      case "root":
        return await runRootAction(action);
    }
  } catch (error) {
    const formatted = formatCliError(error);
    console.error(formatted.message);
    return formatted.exitCode;
  }
}
