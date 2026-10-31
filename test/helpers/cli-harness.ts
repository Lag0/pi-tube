import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CliIo, CliSystem } from "../../src/adapters/cli/io.ts";
import { runCli } from "../../src/adapters/cli/run-cli.ts";
import { type AppOverrides, createApp } from "../../src/bootstrap.ts";

export interface CliRunOptions {
  /** Merged over a hermetic env (temp HOME and config path); `process.env` is never inherited. */
  readonly env?: Record<string, string | undefined>;
  readonly system?: Partial<CliSystem>;
  /** Content of stdin for `--stdin`; reading it sets `stdinRead`. */
  readonly stdin?: string;
  /** Answer to the hidden prompt; its presence simulates a terminal. */
  readonly secret?: string;
  /** Fake providers, media fetcher or process runner handed to the composition root. */
  readonly fakes?: AppOverrides;
  /** Aborts the run, as Ctrl-C does through `main`. */
  readonly signal?: AbortSignal;
}

export interface CliRunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  /** Interactive commands the CLI asked to run, as `command arg...`. */
  readonly systemCalls: readonly string[];
  readonly stdinRead: boolean;
}

/** Runs the CLI in this process with captured IO and a fake system; the temp HOME is removed afterwards. */
export const runCliInProcess = async (argv: string[], options: CliRunOptions = {}): Promise<CliRunResult> => {
  const home = mkdtempSync(path.join(os.tmpdir(), "pi-tube-harness-"));
  const stdout: string[] = [];
  const stderr: string[] = [];
  const systemCalls: string[] = [];
  let stdinRead = false;
  const { secret } = options;
  const io: CliIo = {
    writeOut: (text) => stdout.push(`${text}\n`),
    writeErr: (text) => stderr.push(`${text}\n`),
    readStdin: async () => {
      stdinRead = true;
      return options.stdin ?? "";
    },
    ...(secret === undefined ? {} : { promptSecret: async () => secret }),
  };
  const system: CliSystem = {
    platform: process.platform,
    runInteractive: (command, args) => {
      systemCalls.push([command, ...args].join(" "));
      return 0;
    },
    ...options.system,
  };
  const env = { HOME: home, PI_TUBE_CONFIG_PATH: path.join(home, "config.json"), ...options.env };
  const { signal } = options;

  try {
    const exitCode = await runCli(argv, {
      app: createApp({ env, cwd: process.cwd(), homedir: () => home }, options.fakes),
      io,
      system,
      ...(signal ? { listenForCancel: () => signal } : {}),
    });
    return { exitCode, stdout: stdout.join(""), stderr: stderr.join(""), systemCalls, stdinRead };
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
};
