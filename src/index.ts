const COMMAND_NAME = "pi-tube";
const VERSION = "0.2.0";

const HELP_TEXT = `${COMMAND_NAME} (Bun + TypeScript foundation)\n\nUsage\n  ${COMMAND_NAME} <input>\n  ${COMMAND_NAME} --help\n  ${COMMAND_NAME} --version\n\nNotes\n  Source and provider execution are coming soon in later phases.`;

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP_TEXT);
    return 0;
  }

  if (argv.includes("--version") || argv.includes("-v")) {
    console.log(`${COMMAND_NAME} ${VERSION}`);
    return 0;
  }

  const input = argv.find((arg) => !arg.startsWith("-"));
  if (!input) {
    console.error("Input required. Run `pi-tube --help` for usage.");
    return 1;
  }

  console.error(
    `Not implemented yet for input: ${input}. This behavior is intentionally deferred to later phases.`
  );
  return 2;
}

if (import.meta.main) {
  const code = await main();
  process.exit(code);
}
