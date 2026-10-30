import { Command, CommanderError } from "commander";
import { createError, toPiTubeError } from "../../core/index.ts";
import { APP_VERSION, COMMAND_IDENTITY, getHelpDocument, HELP_TOPICS, type HelpTopic } from "./command-contract.ts";
import { runAuth, runProviders } from "./commands/account.ts";
import { runConfig, runDefaults } from "./commands/config.ts";
import { runTranscribe } from "./commands/transcribe.ts";
import { CliFailure, exitCodeFor, formatErrorForCli } from "./error-output.ts";
import { type HelpDocument, renderHelpDocument } from "./help-renderer.ts";
import type { CliDeps } from "./io.ts";
import { createProgressReporter } from "./progress.ts";
import { handleSetupCommand } from "./setup.ts";
import { hintForCommand } from "./usage-hints.ts";

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
  | { kind: "providers"; options: JsonCommandOptions }
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

interface AuthOptions extends JsonCommandOptions {
  stdin?: boolean;
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
    if (HELP_TOPICS.includes(second as HelpTopic)) {
      return second as HelpTopic;
    }

    throw new CliFailure(
      createError("INPUT_INVALID", `Unsupported help topic: \`${second}\`.`, {
        hint: `Supported help topics: ${COMMAND_IDENTITY} help, ${HELP_TOPICS.map((topic) => `${COMMAND_IDENTITY} help ${topic}`).join(", ")}.`,
      }),
    );
  }

  if (HELP_TOPICS.includes(first as HelpTopic)) {
    return first as HelpTopic;
  }

  return "root";
}

const KEY_ARGUMENT_HINT =
  "API keys are never passed as arguments: use the hidden prompt, or pipe the key with `--stdin`.";

/**
 * Commander quotes the offending token whole, so `--key=<secret>` or `-k<secret>` would reach stderr.
 * Keeps only the flag name of every quoted option token.
 */
const redactOptionValues = (message: string): { readonly message: string; readonly redacted: boolean } => {
  let redacted = false;
  const cleaned = message.replace(
    /'(--[^'=\s]+)[=\s][^']*'|'(-[^-'\s])[^']+'/g,
    (_token, longFlag: string | undefined, shortFlag: string | undefined) => {
      redacted = true;
      return `'${longFlag ?? shortFlag}'`;
    },
  );
  return { message: cleaned, redacted };
};

function commanderErrorToCliFailure(error: CommanderError, argv: readonly string[]): CliFailure {
  const { message, redacted } = redactOptionValues(error.message);
  const isKeyAttempt = message.includes("'--key'") || (argv[0] === "auth" && redacted);
  return new CliFailure(
    createError("INPUT_INVALID", message, { hint: isKeyAttempt ? KEY_ARGUMENT_HINT : hintForCommand(argv[0]) }),
  );
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
    .option("--json", "Print the result as JSON on stdout and save the transcript as JSON.")
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
    .command("providers")
    .description("Show which providers have an API key and where it comes from.")
    .option("--json", "Output deterministic JSON format.")
    .action((options: JsonCommandOptions) => {
      setAction({ kind: "providers", options });
    });

  program
    .command("auth")
    .description("Manage provider API keys.")
    .argument("[action]", "login, status, or logout")
    .argument("[provider]", "deepgram, groq or elevenlabs")
    .option("--stdin", "Read the API key from stdin instead of a hidden prompt.")
    .option("--json", "Output deterministic JSON format.")
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

  program
    .command("config")
    .description("Read and change config values.")
    .argument("[args...]", "list, get <key>, or set <key> <value>")
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

async function runDownloadAction(
  action: Extract<CliAction, { kind: "download" }>,
  { app, io }: CliDeps,
): Promise<number> {
  const progress = createProgressReporter({ color: action.rootOptions.color !== false, stream: io.progressStream });
  const startTime = Date.now();
  try {
    const result = await app.legacy.download({
      input: action.input,
      extraPositionals: action.extraPositionals,
      audio: Boolean(action.options.audio),
      outputDir: action.options.output,
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
        return await runTranscribe(deps, {
          input: action.input,
          extraPositionals: action.extraPositionals,
          provider: action.options.provider,
          language: action.options.language,
          timestamps: Boolean(action.options.timestamps),
          json: Boolean(action.options.json),
          color: action.rootOptions.color !== false,
        });
      case "download":
        return await runDownloadAction(action, deps);
      case "providers":
        return await runProviders(deps, { json: Boolean(action.options.json) });
      case "auth":
        return await runAuth(deps, {
          action: action.action,
          provider: action.provider,
          stdin: Boolean(action.options.stdin),
          json: Boolean(action.options.json),
        });
      case "defaults":
        return await runDefaults(deps, action.action, action.value);
      case "setup":
        return runSetupAction(action, deps);
      case "config":
        return await runConfig(deps, action.args, Boolean(action.options.json));
      case "root":
        return runRootAction(action);
    }
  } catch (caught) {
    const error = toPiTubeError(caught);
    deps.io.writeErr(formatErrorForCli(error));
    return exitCodeFor(error);
  }
};
