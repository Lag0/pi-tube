import {
  APP_VERSION,
  COMMAND_IDENTITY,
  GLOBAL_FLAGS,
  HELP_COMMAND_ROWS,
  HELP_EXAMPLES,
  HELP_NOTES,
  HELP_SECTIONS,
} from "./command-contract.ts";
import {
  formatBaselineIntakeResult,
  handleBaselineInput,
  handleDeferredCommand,
  isDeferredCommand,
} from "./handlers.ts";
import { CliError, formatCliError } from "../errors/cli-errors.ts";
import { isLegacyCommand, throwLegacyCommandGuidance } from "../legacy/compatibility.ts";

interface ParsedArgs {
  showHelp: boolean;
  showVersion: boolean;
  json: boolean;
  provider?: string;
  language?: string;
  positionals: string[];
}

function renderHelp(): string {
  const lines = [
    HELP_SECTIONS.usage,
    `  ${COMMAND_IDENTITY} <input> [--provider <deepgram|groq>] [--language <code>] [--json]`,
    "",
    HELP_SECTIONS.commands,
    ...HELP_COMMAND_ROWS.map((row) => `  ${row}`),
    "",
    HELP_SECTIONS.options,
    `  -h, ${GLOBAL_FLAGS[0]}      Show help`,
    `  -v, ${GLOBAL_FLAGS[1]}   Show version`,
    `      ${GLOBAL_FLAGS[2]}      Output deterministic JSON format`,
    `      ${GLOBAL_FLAGS[3]} <deepgram|groq>  Select transcription provider (default: deepgram)`,
    `      ${GLOBAL_FLAGS[4]} <code>            Optional language preference`,
    "",
    HELP_SECTIONS.examples,
    ...HELP_EXAMPLES.map((example) => `  ${example}`),
    "",
    HELP_SECTIONS.notes,
    ...HELP_NOTES.map((note) => `  ${note}`),
  ];

  return lines.join("\n");
}

function parse(argv: string[]): ParsedArgs {
  if (argv.length === 0) {
    return { showHelp: true, showVersion: false, json: false, positionals: [] };
  }

  let showHelp = false;
  let showVersion = false;
  let json = false;
  let provider: string | undefined;
  let language: string | undefined;
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

  return { showHelp, showVersion, json, provider, language, positionals };
}

export async function runCli(argv: string[]): Promise<number> {
  try {
    const parsed = parse(argv);

    if (parsed.showHelp) {
      console.log(renderHelp());
      return 0;
    }

    if (parsed.showVersion) {
      console.log(`${COMMAND_IDENTITY} ${APP_VERSION}`);
      return 0;
    }

    const [first, ...rest] = parsed.positionals;
    if (!first) {
      throw new CliError(`Missing required input.`, {
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

    const result = await handleBaselineInput({
      input: first,
      json: parsed.json,
      extraPositionals: rest,
      provider: parsed.provider,
      language: parsed.language,
    });
    console.log(formatBaselineIntakeResult(result));
    return 0;
  } catch (error) {
    const formatted = formatCliError(error);
    console.error(formatted.message);
    return formatted.exitCode;
  }
}
