import { runCli } from "./cli/build-cli.ts";

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  return runCli(argv);
}

if (import.meta.main) {
  const code = await main();
  process.exit(code);
}
