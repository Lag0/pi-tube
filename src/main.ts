import os from "node:os";
import { exitCodeFor, formatErrorForCli } from "./adapters/cli/error-output.ts";
import { createProcessIo } from "./adapters/cli/process-io.ts";
import { runCli } from "./adapters/cli/run-cli.ts";
import { createApp } from "./bootstrap.ts";
import { toPiTubeError } from "./core/index.ts";
import { runInteractiveCommand } from "./infrastructure/interactive-command.ts";

// SIGHUP too: yt-dlp runs in its own process group, so a closed terminal would otherwise orphan it.
const CANCEL_SIGNALS: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];

/**
 * CLI entry point: binds the real process to `runCli` and returns the exit code. The first Ctrl-C, SIGHUP or
 * SIGTERM cancels the running operation (exit 130, temp files removed); a second one kills the process.
 */
export const main = async (argv: readonly string[] = process.argv.slice(2)): Promise<number> => {
  const controller = new AbortController();
  const cancel = (): void => controller.abort();
  for (const signal of CANCEL_SIGNALS) process.once(signal, cancel);

  try {
    return await runCli(argv, {
      app: createApp({ env: process.env, cwd: process.cwd(), homedir: os.homedir }),
      io: createProcessIo(),
      system: { platform: process.platform, runInteractive: runInteractiveCommand },
      signal: controller.signal,
    });
  } catch (caught) {
    const error = toPiTubeError(caught);
    console.error(formatErrorForCli(error));
    return exitCodeFor(error);
  } finally {
    for (const signal of CANCEL_SIGNALS) process.off(signal, cancel);
  }
};

if (import.meta.main) {
  process.exit(await main());
}
