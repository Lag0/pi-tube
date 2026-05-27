import { Command, CommanderError } from "commander";
import {
  APP_VERSION,
  COMMAND_IDENTITY,
  getHelpDocument,
  type HelpTopic,
} from "./command-contract.ts";
import { renderHelpDocument, type HelpDocument } from "./help-renderer.ts";
import {
  handleAuthLogin,
  handleAuthLogout,
  handleAuthStatus,
  handleBaselineInput,
  handleConfigCommand,
  handleDefaultsLanguage,
  handleDefaultsProvider,
  handleDefaultsShow,
  handleDownloadCommand,
  persistBaselineIntakeResult,
} from "./handlers.ts";
import { handleSetupCommand } from "./setup.ts";
import { CliError, formatCliError } from "../errors/cli-errors.ts";
import { createProgressReporter } from "./progress.ts";

type CliAction =
  | { kind: "root"; input?: string; extraPositionals: string[]; options: RootOptions }
  | { kind: "version" }
  | { kind: "help"; positionals: string[]; noColor: boolean }
  | { kind: "transcribe"; input?: string; extraPositionals: string[]; options: TranscribeOptions; rootOptions: RootOptions }
  | { kind: "download"; input?: string; extraPositionals: string[]; options: DownloadOptions; rootOptions: RootOptions }
  | { kind: "auth"; action?: string; provider?: string; options: AuthOptions; rootOptions: RootOptions }
  | { kind: "defaults"; action?: string; value?: string; rootOptions: RootOptions }
  | { kind: "setup"; subcommand?: string; options: SetupCommandOptions; rootOptions: RootOptions }
  | { kind: "config"; args: string[]; options: JsonCommandOptions; rootOptions: RootOptions };

interface RootOptions {
  version?: boolean;
  color?: boolean;
}

interface JsonCommandOptions {
  json?: boolean;
}

interface TranscribeOptions extends JsonCommandOptions {
  provider?: string;
  language?: string;
  timestamps?: boolean;
}

interface DownloadOptions {
  audio?: boolean;
  output?: string;
}

interface AuthOptions {
  key?: string;
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

    if (!second) return "root";
    if (["transcribe", "download", "auth", "defaults", "setup"].includes(second)) {
      return second as HelpTopic;
    }

    throw new CliError(`Unsupported help topic: \`${second}\`.`, {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: [
        `Supported help topics: ${COMMAND_IDENTITY} help, ${COMMAND_IDENTITY} help transcribe, ${COMMAND_IDENTITY} help download, ${COMMAND_IDENTITY} help auth, ${COMMAND_IDENTITY} help defaults, ${COMMAND_IDENTITY} help setup.`,
      ],
    });
  }

  if (["transcribe", "download", "auth", "defaults", "setup"].includes(first ?? "")) {
    return first as HelpTopic;
  }

  return "root";
}

function guidanceForCommand(command: string | undefined): string[] {
  switch (command) {
    case "transcribe":
      return ["Use one of: `pi-tube transcribe <input>`, `pi-tube transcribe <input> --provider <deepgram|groq|elevenlabs>`, `pi-tube transcribe <input> --json`."];
    case "download":
      return ["Use one of: `pi-tube download <url>`, `pi-tube download <url> --audio`, `pi-tube download <url> --output <dir>`."];
    case "auth":
      return ["Use one of: `pi-tube auth login <deepgram|groq|elevenlabs>`, `pi-tube auth status`, `pi-tube auth logout <deepgram|groq|elevenlabs>`."];
    case "defaults":
      return ["Use one of: `pi-tube defaults provider <deepgram|groq|elevenlabs>`, `pi-tube defaults language <code>`, `pi-tube defaults show`."];
    case "setup":
      return ["Use one of: `pi-tube setup yt-dlp`, `pi-tube setup skills`, `pi-tube setup mcp`."];
    default:
      return ["Use one of: `pi-tube transcribe <input>`, `pi-tube download <url>`, `pi-tube auth status`, `pi-tube defaults show`, `pi-tube setup yt-dlp`."];
  }
}

function commanderErrorToCliError(error: CommanderError, argv: string[]): CliError {
  return new CliError(error.message, {
    code: "CLI_CONTRACT_VIOLATION",
    exitCode: error.exitCode === 0 ? 0 : 2,
    guidance: guidanceForCommand(argv[0]),
  });
}

function createProgram(setAction: (action: CliAction) => void): Command {
  const program = new Command()
    .name(COMMAND_IDENTITY)
    .description("Transcribe and download public media with provider-based AI transcription.")
    .exitOverride()
    .configureOutput({
      writeOut: () => undefined,
      writeErr: () => undefined,
    })
    .allowExcessArguments(true)
    .allowUnknownOption(false)
    .helpOption(false)
    .addHelpCommand(false)
    .argument("[input]", "deprecated implicit transcribe input")
    .argument("[extraPositionals...]", "extra inputs")
    .option("-v, --version", "Show version.")
    .option("--no-color", "Disable ANSI colors in help output.")
    .action((input: string | undefined, extraPositionals: string[]) => {
      const options = program.opts<RootOptions>();
      if (options.version) {
        setAction({ kind: "version" });
        return;
      }
      setAction({ kind: "root", input, extraPositionals, options });
    });

  program
    .command("transcribe")
    .description("Transcribe a URL or local media file.")
    .argument("[input]", "URL or local media file")
    .argument("[extraPositionals...]", "extra inputs")
    .option("--provider <provider>", "Select transcription provider (deepgram or groq).")
    .option("--language <code>", "Optional language preference.")
    .option("--timestamps", "Include timestamp blocks in transcript output.")
    .option("--json", "Output deterministic JSON format.")
    .action((input: string | undefined, extraPositionals: string[], options: TranscribeOptions) => {
      setAction({ kind: "transcribe", input, extraPositionals, options, rootOptions: program.opts<RootOptions>() });
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
    .command("auth")
    .description("Manage provider API keys.")
    .argument("[action]", "login, status, or logout")
    .argument("[provider]", "deepgram or groq")
    .option("--key <api_key>", "API key for non-interactive login.")
    .action((action: string | undefined, provider: string | undefined, options: AuthOptions) => {
      setAction({ kind: "auth", action, provider, options, rootOptions: program.opts<RootOptions>() });
    });

  program
    .command("defaults")
    .description("Manage default provider and language.")
    .argument("[action]", "provider, language, or show")
    .argument("[value]", "provider id or language code")
    .action((action: string | undefined, value: string | undefined) => {
      setAction({ kind: "defaults", action, value, rootOptions: program.opts<RootOptions>() });
    });

  program
    .command("setup")
    .description("Install and bootstrap helper workflows.")
    .argument("[subcommand]", "skills, yt-dlp, or mcp")
    .option("-g, --global", "Use global setup target.")
    .option("-a, --agent <name>", "Select setup agent target.")
    .option("-y, --yes", "Run setup non-interactively.")
    .option("--no-prompt", "Run setup non-interactively.")
    .option("--non-interactive", "Run setup non-interactively.")
    .action((subcommand: string | undefined, options: SetupCommandOptions) => {
      setAction({ kind: "setup", subcommand, options, rootOptions: program.opts<RootOptions>() });
    });

  // Hidden legacy escape hatch for existing scripts. Not documented in root help.
  program
    .command("config")
    .description("Legacy raw configuration command.")
    .argument("[args...]", "legacy config action and arguments")
    .option("--json", "Emit deterministic JSON output.")
    .action((args: string[], options: JsonCommandOptions) => {
      setAction({ kind: "config", args, options, rootOptions: program.opts<RootOptions>() });
    });

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
    if (error instanceof CommanderError) throw commanderErrorToCliError(error, argv);
    throw error;
  }

  return action ?? { kind: "root", input: undefined, extraPositionals: [], options: program.opts<RootOptions>() };
}

async function runTranscribeAction(action: Extract<CliAction, { kind: "transcribe" }>): Promise<number> {
  const progress = createProgressReporter({ color: action.rootOptions.color !== false });
  const startTime = Date.now();

  try {
    const result = await handleBaselineInput({
      input: action.input ?? "",
      json: Boolean(action.options.json),
      extraPositionals: action.extraPositionals,
      provider: action.options.provider,
      language: action.options.language,
      timestamps: Boolean(action.options.timestamps),
      onProgress: (step) => progress.update(step),
    });

    progress.update({ label: "Saving output..." });
    const persisted = persistBaselineIntakeResult(result, { env: process.env, cwd: process.cwd() });
    progress.succeed(persisted.outputPath, Date.now() - startTime);
    console.log(`[OUTPUT_FILE] ${persisted.outputPath}`);
    console.log(`[OUTPUT_FILE_URI] ${persisted.outputUri}`);
    return 0;
  } catch (error) {
    progress.fail("Failed");
    throw error;
  }
}

async function runDownloadAction(action: Extract<CliAction, { kind: "download" }>): Promise<number> {
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

function promptForApiKey(provider: string | undefined): string | undefined {
  if (typeof prompt !== "function") return undefined;
  return prompt(`Paste ${provider ?? "provider"} API key:`)?.trim();
}

function runAuthAction(action: Extract<CliAction, { kind: "auth" }>): number {
  switch (action.action) {
    case "login": {
      const apiKey = action.provider
        ? action.options.key ?? process.env.PI_TUBE_TEST_AUTH_KEY ?? promptForApiKey(action.provider)
        : undefined;
      console.log(handleAuthLogin({ provider: action.provider, apiKey, options: { env: process.env } }));
      return 0;
    }
    case "status":
      console.log(handleAuthStatus({ env: process.env, options: { env: process.env } }));
      return 0;
    case "logout":
      console.log(handleAuthLogout({ provider: action.provider, options: { env: process.env } }));
      return 0;
    default:
      throw new CliError("Missing or unsupported auth action.", {
        code: "CLI_CONTRACT_VIOLATION",
        exitCode: 2,
        guidance: guidanceForCommand("auth"),
      });
  }
}

function runDefaultsAction(action: Extract<CliAction, { kind: "defaults" }>): number {
  switch (action.action) {
    case "provider":
      console.log(handleDefaultsProvider({ provider: action.value, options: { env: process.env } }));
      return 0;
    case "language":
      console.log(handleDefaultsLanguage({ language: action.value, options: { env: process.env } }));
      return 0;
    case "show":
      console.log(handleDefaultsShow({ options: { env: process.env } }));
      return 0;
    default:
      throw new CliError("Missing or unsupported defaults action.", {
        code: "CLI_CONTRACT_VIOLATION",
        exitCode: 2,
        guidance: guidanceForCommand("defaults"),
      });
  }
}

function runSetupAction(action: Extract<CliAction, { kind: "setup" }>): number {
  const output = handleSetupCommand(action.subcommand, {
    global: action.options.global,
    nonInteractive: Boolean(action.options.yes || action.options.prompt === false || action.options.nonInteractive),
    agent: action.options.agent,
  });
  if (output) console.log(output);
  return 0;
}

function runConfigAction(action: Extract<CliAction, { kind: "config" }>): number {
  console.log(handleConfigCommand({ args: action.args, json: Boolean(action.options.json), options: { env: process.env } }));
  return 0;
}

function runRootAction(action: Extract<CliAction, { kind: "root" }>): number {
  if (action.input) {
    throw new CliError("Implicit transcription is no longer supported.", {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: guidanceForCommand(undefined),
    });
  }

  throw new CliError("Missing command.", {
    code: "CLI_CONTRACT_VIOLATION",
    exitCode: 2,
    guidance: guidanceForCommand(undefined),
  });
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
      case "transcribe":
        return await runTranscribeAction(action);
      case "download":
        return await runDownloadAction(action);
      case "auth":
        return runAuthAction(action);
      case "defaults":
        return runDefaultsAction(action);
      case "setup":
        return runSetupAction(action);
      case "config":
        return runConfigAction(action);
      case "root":
        return runRootAction(action);
    }
  } catch (error) {
    const formatted = formatCliError(error);
    console.error(formatted.message);
    return formatted.exitCode;
  }
}
