import os from "node:os";
import { format } from "node:util";
import { exitCodeFor, formatErrorForCli } from "./adapters/cli/error-output.ts";
import { createProcessIo } from "./adapters/cli/process-io.ts";
import { runCli } from "./adapters/cli/run-cli.ts";
import { createApp, PI_TUBE_VERSION } from "./bootstrap.ts";
import { toPiTubeError } from "./core/index.ts";
import { runInteractiveCommand } from "./infrastructure/interactive-command.ts";

// SIGHUP too: yt-dlp runs in its own process group, so a closed terminal would otherwise orphan it.
const CANCEL_SIGNALS: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];

/** In MCP mode stdout carries only MCP messages: whatever a dependency logs to the console goes to stderr. */
const sendConsoleToStderr = (): void => {
  const toStderr = (...values: unknown[]): void => {
    process.stderr.write(`${format(...values)}\n`);
  };
  console.log = toStderr;
  console.info = toStderr;
  console.debug = toStderr;
  console.dir = (value: unknown) => toStderr(value);
};

/**
 * Entry point: binds the real process to `runCli` and returns the exit code. During `transcribe`, `download` and
 * `info`, the first Ctrl-C, SIGHUP or SIGTERM cancels the operation (exit 130, temp files removed) and a second one
 * kills the process; every other command keeps the default signal behavior. `pi-tube mcp`, with nothing after it,
 * serves MCP on stdio instead, until stdin closes or one of those signals arrives (exit 0); there the console writes to
 * stderr, so nothing but MCP messages reaches stdout.
 */
export const main = async (argv: readonly string[] = process.argv.slice(2)): Promise<number> => {
  // groq-sdk prints every request's headers, the API key included, when DEBUG=true; pi-tube never prints a key.
  if (process.env.DEBUG === "true") Reflect.deleteProperty(process.env, "DEBUG");
  const controller = new AbortController();
  const cancel = (): void => controller.abort();
  const listenForCancel = (): AbortSignal => {
    for (const signal of CANCEL_SIGNALS) process.once(signal, cancel);
    return controller.signal;
  };

  try {
    if (argv.length === 1 && argv[0] === "mcp") {
      sendConsoleToStderr();
      // Loaded only here, so the CLI never pays for the MCP SDK.
      const { runMcpServer } = await import("./adapters/mcp/serve.ts");
      return await runMcpServer({
        app: createApp({ env: process.env, cwd: process.cwd(), homedir: os.homedir, adapter: "mcp" }),
        env: process.env,
        version: PI_TUBE_VERSION,
        writeErr: (line) => process.stderr.write(line),
        signal: listenForCancel(),
        stdin: process.stdin,
      });
    }
    return await runCli(argv, {
      app: createApp({ env: process.env, cwd: process.cwd(), homedir: os.homedir, adapter: "cli" }),
      io: createProcessIo(),
      system: { platform: process.platform, runInteractive: runInteractiveCommand },
      listenForCancel,
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
