import {
  APP_VERSION,
  COMMAND_IDENTITY,
  GLOBAL_FLAGS,
  HELP_COMMAND_ROWS,
  HELP_EXAMPLES,
  HELP_NOTES,
  HELP_SECTIONS,
} from "./command-contract.ts";
import { handleBaselineInput, type HandlerResult } from "./handlers.ts";

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

function parse(argv: string[]): { showHelp: boolean; showVersion: boolean; json: boolean; input?: string } {
  if (argv.length === 0) {
    return { showHelp: true, showVersion: false, json: false };
  }

  const showHelp = argv.includes("--help") || argv.includes("-h");
  const showVersion = argv.includes("--version") || argv.includes("-v");
  const json = argv.includes("--json");

  const input = argv.find((arg) => !arg.startsWith("-"));
  return { showHelp, showVersion, json, input };
}

function printResult(result: HandlerResult): number {
  if (result.stdout) {
    console.log(result.stdout);
  }
  if (result.stderr) {
    console.error(result.stderr);
  }
  return result.exitCode;
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

  if (!parsed.input) {
    console.error(`Missing required input. Run \`${COMMAND_IDENTITY} --help\` for usage.`);
    return 1;
  }

  return printResult(handleBaselineInput({ input: parsed.input, json: parsed.json }));
}
