import { Command, CommanderError } from "commander";
import { createError, toPiTubeError } from "../../core/index.ts";
import { APP_VERSION, COMMAND_IDENTITY, getHelpDocument, type HelpTopic } from "./command-contract.ts";
import { CliFailure, exitCodeFor, formatErrorForCli } from "./error-output.ts";
import { type HelpDocument, renderHelpDocument } from "./help-renderer.ts";
import type { CliDeps } from "./io.ts";
import { createProgressReporter } from "./progress.ts";
import { handleSetupCommand } from "./setup.ts";

type CliAction =
  | { kind: "root"; input?: string; extraPositionals: string[]; options: RootOptions }
  | { kind: "version" }
  | { kind: "help"; positionals: string[]; noColor: boolean }
  | {
      kind: "transcribe";
      input?: string;
      extraPositionals: string[];
      options: TranscribeOptions;
      rootOptions: RootOptions;
    }
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
      throw new CliFailure(createError("INPUT_INVALID", "`help` accepts at most one command name."));
    }

    if (!second) return "root";
    if (["transcribe", "download", "auth", "defaults", "setup"].includes(second)) {
      return second as HelpTopic;
    }

    throw new CliFailure(
      createError("INPUT_INVALID", `Unsupported help topic: \`${second}\`.`, {
        hint: `Supported help topics: ${COMMAND_IDENTITY} help, ${COMMAND_IDENTITY} help transcribe, ${COMMAND_IDENTITY} help download, ${COMMAND_IDENTITY} help auth, ${COMMAND_IDENTITY} help defaults, ${COMMAND_IDENTITY} help setup.`,
      }),
    );
  }

  if (["transcribe", "download", "auth", "defaults", "setup"].includes(first ?? "")) {
    return first as HelpTopic;
  }

  return "root";
}

function hintForCommand(command: string | undefined): string {
  switch (command) {
    case "transcribe":
      return "Use one of: `pi-tube transcribe <input>`, `pi-tube transcribe <input> --provider <deepgram|groq|elevenlabs>`, `pi-tube transcribe <input> --json`.";
    case "download":
      return "Use one of: `pi-tube download <url>`, `pi-tube download <url> --audio`, `pi-tube download <url> --output <dir>`.";
    case "auth":
      return "Use one of: `pi-tube auth login <deepgram|groq|elevenlabs>`, `pi-tube auth status`, `pi-tube auth logout <deepgram|groq|elevenlabs>`.";
    case "defaults":
      return "Use one of: `pi-tube defaults provider <deepgram|groq|elevenlabs>`, `pi-tube defaults language <code>`, `pi-tube defaults show`.";
    case "setup":
      return "Use one of: `pi-tube setup yt-dlp`, `pi-tube setup skills`, `pi-tube setup mcp`.";
    default:
      return "Use one of: `pi-tube transcribe <input>`, `pi-tube download <url>`, `pi-tube auth status`, `pi-tube defaults show`, `pi-tube setup yt-dlp`.";
  }
}

function commanderErrorToCliFailure(error: CommanderError, argv: readonly string[]): CliFailure {
  return new CliFailure(createError("INPUT_INVALID", error.message, { hint: hintForCommand(argv[0]) }));
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
    if (error instanceof CommanderError) throw commanderErrorToCliFailure(error, argv);
    throw error;
  }

  return action ?? { kind: "root", input: undefined, extraPositionals: [], options: program.opts<RootOptions>() };
}

async function runTranscribeAction(
  action: Extract<CliAction, { kind: "transcribe" }>,
  { app, io }: CliDeps,
): Promise<number> {
  const progress = createProgressReporter({ color: action.rootOptions.color !== false, stream: io.progressStream });
  const startTime = Date.now();
  const { env, cwd } = app.environment;

  try {
    const result = await app.legacy.handleBaselineInput({
      input: action.input ?? "",
      json: Boolean(action.options.json),
      extraPositionals: action.extraPositionals,
      provider: action.options.provider,
      language: action.options.language,
      timestamps: Boolean(action.options.timestamps),
      transcriptionOptions: { env },
      onProgress: (step) => progress.update(step),
    });

    progress.update({ label: "Saving output..." });
    const persisted = app.legacy.persistBaselineIntakeResult(result, { env, cwd });
    progress.succeed(persisted.outputPath, Date.now() - startTime);
    io.writeOut(`[OUTPUT_FILE] ${persisted.outputPath}`);
    io.writeOut(`[OUTPUT_FILE_URI] ${persisted.outputUri}`);
    return 0;
  } catch (error) {
    progress.fail("Failed");
    throw error;
  }
}

async function runDownloadAction(
  action: Extract<CliAction, { kind: "download" }>,
  { app, io }: CliDeps,
): Promise<number> {
  const progress = createProgressReporter({ color: action.rootOptions.color !== false, stream: io.progressStream });
  const startTime = Date.now();
  try {
    const result = await app.legacy.handleDownloadCommand({
      input: action.input,
      extraPositionals: action.extraPositionals,
      audio: Boolean(action.options.audio),
      outputDir: action.options.output,
      env: app.environment.env,
      cwd: app.environment.cwd,
      onProgress: (step) => progress.update(step),
    });
    progress.succeed(result.outputPath, Date.now() - startTime);
    io.writeOut(`[DOWNLOAD_FILE] ${result.outputPath}`);
    io.writeOut(`[DOWNLOAD_FILE_URI] ${result.outputUri}`);
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

function runAuthAction(action: Extract<CliAction, { kind: "auth" }>, { app, io }: CliDeps): number {
  const options = { env: app.environment.env };
  switch (action.action) {
    case "login": {
      const apiKey = action.provider
        ? (action.options.key ?? options.env.PI_TUBE_TEST_AUTH_KEY ?? promptForApiKey(action.provider))
        : undefined;
      io.writeOut(app.legacy.handleAuthLogin({ provider: action.provider, apiKey, options }));
      return 0;
    }
    case "status":
      io.writeOut(app.legacy.handleAuthStatus({ env: options.env, options }));
      return 0;
    case "logout":
      io.writeOut(app.legacy.handleAuthLogout({ provider: action.provider, options }));
      return 0;
    default:
      throw new CliFailure(
        createError("INPUT_INVALID", "Missing or unsupported auth action.", { hint: hintForCommand("auth") }),
      );
  }
}

function runDefaultsAction(action: Extract<CliAction, { kind: "defaults" }>, { app, io }: CliDeps): number {
  const options = { env: app.environment.env };
  switch (action.action) {
    case "provider":
      io.writeOut(app.legacy.handleDefaultsProvider({ provider: action.value, options }));
      return 0;
    case "language":
      io.writeOut(app.legacy.handleDefaultsLanguage({ language: action.value, options }));
      return 0;
    case "show":
      io.writeOut(app.legacy.handleDefaultsShow({ options }));
      return 0;
    default:
      throw new CliFailure(
        createError("INPUT_INVALID", "Missing or unsupported defaults action.", { hint: hintForCommand("defaults") }),
      );
  }
}

function runSetupAction(action: Extract<CliAction, { kind: "setup" }>, { io, system }: CliDeps): number {
  const output = handleSetupCommand(action.subcommand, {
    global: action.options.global,
    nonInteractive: Boolean(action.options.yes || action.options.prompt === false || action.options.nonInteractive),
    agent: action.options.agent,
    platform: system.platform,
    runInteractive: system.runInteractive,
    writeOut: io.writeOut,
  });
  if (output) io.writeOut(output);
  return 0;
}

function runConfigAction(action: Extract<CliAction, { kind: "config" }>, { app, io }: CliDeps): number {
  io.writeOut(
    app.legacy.handleConfigCommand({
      args: action.args,
      json: Boolean(action.options.json),
      options: { env: app.environment.env },
    }),
  );
  return 0;
}

function runRootAction(action: Extract<CliAction, { kind: "root" }>): number {
  if (action.input) {
    throw new CliFailure(
      createError("INPUT_INVALID", "Implicit transcription is no longer supported.", {
        hint: hintForCommand(undefined),
      }),
    );
  }

  throw new CliFailure(createError("INPUT_INVALID", "Missing command.", { hint: hintForCommand(undefined) }));
}

/** Runs one CLI invocation against injected dependencies and returns the process exit code. */
export const runCli = async (argv: readonly string[], deps: CliDeps): Promise<number> => {
  try {
    const action = parseAction([...argv]);

    switch (action.kind) {
      case "help": {
        const helpTopic = resolveHelpTopic(action.positionals);
        deps.io.writeOut(renderHelp(helpTopic, !action.noColor));
        return 0;
      }
      case "version":
        deps.io.writeOut(`${COMMAND_IDENTITY} ${APP_VERSION}`);
        return 0;
      case "transcribe":
        return await runTranscribeAction(action, deps);
      case "download":
        return await runDownloadAction(action, deps);
      case "auth":
        return runAuthAction(action, deps);
      case "defaults":
        return runDefaultsAction(action, deps);
      case "setup":
        return runSetupAction(action, deps);
      case "config":
        return runConfigAction(action, deps);
      case "root":
        return runRootAction(action);
    }
  } catch (caught) {
    const error = toPiTubeError(caught);
    deps.io.writeErr(formatErrorForCli(error));
    return exitCodeFor(error);
  }
};
