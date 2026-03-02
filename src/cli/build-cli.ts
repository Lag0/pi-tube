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
  handleBaselineInput,
  handleDeferredCommand,
  isDeferredCommand,
} from "./handlers.ts";
import { formatCliError } from "../errors/cli-errors.ts";

interface ParsedArgs {
  showHelp: boolean;
  showVersion: boolean;
  json: boolean;
  positionals: string[];
}

function renderHelp(): string {
  const lines = [
    HELP_SECTIONS.usage,
    `  ${COMMAND_IDENTITY} <input> [--json]`,
    "",
    HELP_SECTIONS.commands,
    ...HELP_COMMAND_ROWS.map((row) => `  ${row}`),
    "",
    HELP_SECTIONS.options,
    `  -h, ${GLOBAL_FLAGS[0]}      Show help`,
    `  -v, ${GLOBAL_FLAGS[1]}   Show version`,
    `      ${GLOBAL_FLAGS[2]}      Output JSON format (coming soon in Phase 5)`,
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

  const showHelp = argv.includes("--help") || argv.includes("-h");
  const showVersion = argv.includes("--version") || argv.includes("-v");
  const json = argv.includes("--json");
  const positionals = argv.filter((arg) => !arg.startsWith("-"));

  return { showHelp, showVersion, json, positionals };
}

export async function runCli(argv: string[]): Promise<number> {
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
    console.error(`Missing required input. Run \`${COMMAND_IDENTITY} --help\` for usage.`);
    return 1;
  }

  try {
    if (isDeferredCommand(first)) {
      handleDeferredCommand(first, parsed.json);
    }

    handleBaselineInput({ input: first, json: parsed.json, extraPositionals: rest });
    return 0;
  } catch (error) {
    const formatted = formatCliError(error);
    console.error(formatted.message);
    return formatted.exitCode;
  }
}
