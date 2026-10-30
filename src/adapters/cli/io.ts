import type { App } from "../../bootstrap.ts";

/** Where the CLI writes. Each writer appends a newline; stdout carries results only. */
export interface CliIo {
  readonly writeOut: (text: string) => void;
  readonly writeErr: (text: string) => void;
  /** Terminal stream for the progress spinner; absent when stderr is not a TTY. */
  readonly progressStream?: NodeJS.WriteStream;
}

/** Host facilities the CLI needs beyond IO. */
export interface CliSystem {
  readonly platform: NodeJS.Platform;
  /** Runs a command attached to the user's terminal and returns its exit code. */
  readonly runInteractive: (command: string, args: readonly string[]) => number;
}

/** Everything `runCli` depends on; tests inject fakes, `main` injects the real process. */
export interface CliDeps {
  readonly app: App;
  readonly io: CliIo;
  readonly system: CliSystem;
}
