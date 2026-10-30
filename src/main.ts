import os from "node:os";
import { createProcessIo } from "./adapters/cli/process-io.ts";
import { runCli } from "./adapters/cli/run-cli.ts";
import { createApp } from "./bootstrap.ts";
import { runInteractiveCommand } from "./infrastructure/interactive-command.ts";

/** CLI entry point: binds the real process to `runCli` and returns the exit code. */
export const main = async (argv: readonly string[] = process.argv.slice(2)): Promise<number> =>
  runCli(argv, {
    app: createApp({ env: process.env, cwd: process.cwd(), homedir: os.homedir }),
    io: createProcessIo(),
    system: { platform: process.platform, runInteractive: runInteractiveCommand },
  });

if (import.meta.main) {
  process.exit(await main());
}
