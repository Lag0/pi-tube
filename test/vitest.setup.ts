import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

interface BunSpawnOptions {
  cmd: string[];
  stdout?: "pipe" | "inherit" | "ignore";
  stderr?: "pipe" | "inherit" | "ignore";
  stdin?: "pipe" | "inherit" | "ignore";
  env?: Record<string, string | undefined>;
  cwd?: string;
}

interface BunSubprocess {
  stdout: ReturnType<typeof Readable.toWeb> | null;
  stderr: ReturnType<typeof Readable.toWeb> | null;
  exited: Promise<number>;
  readonly exitCode: number | null;
  kill(signal?: NodeJS.Signals): void;
}

interface BunSpawnSyncOptions {
  cmd: string[];
  stdout?: "pipe" | "inherit" | "ignore";
  stderr?: "pipe" | "inherit" | "ignore";
  stdin?: "pipe" | "inherit" | "ignore";
  env?: Record<string, string | undefined>;
  cwd?: string;
}

interface BunSpawnSyncResult {
  stdout: Buffer;
  stderr: Buffer;
  exitCode: number;
  success: boolean;
}

function bunSpawnSync(options: BunSpawnSyncOptions): BunSpawnSyncResult {
  const [command, ...args] = options.cmd;
  if (!command) {
    throw new Error("Bun.spawnSync requires a non-empty cmd array.");
  }

  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: [options.stdin ?? "ignore", options.stdout ?? "pipe", options.stderr ?? "pipe"],
  });

  if (result.error) {
    throw result.error;
  }

  const exitCode = result.status ?? 1;
  return {
    stdout: Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? ""),
    stderr: Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(result.stderr ?? ""),
    exitCode,
    success: exitCode === 0,
  };
}

function resolveExecutable(command: string, env: Record<string, string | undefined>): string | undefined {
  if (path.isAbsolute(command) || command.includes("/") || command.includes("\\")) {
    return existsSync(command) ? command : undefined;
  }

  const extensions = process.platform === "win32" ? ["", ...(env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";")] : [""];
  for (const dir of (env.PATH ?? env.Path ?? "").split(path.delimiter)) {
    for (const extension of extensions) {
      const candidate = path.join(dir, `${command}${extension}`);
      if (dir && existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
}

// Mirrors the Bun.spawn surface the code uses. Like Bun, a missing executable throws synchronously.
function bunSpawn(options: BunSpawnOptions): BunSubprocess {
  const [command, ...args] = options.cmd;
  if (!command) {
    throw new Error("Bun.spawn requires a non-empty cmd array.");
  }

  const env = options.env ?? process.env;
  const executable = resolveExecutable(command, env);
  if (!executable) {
    throw new Error(`ENOENT: executable "${command}" not found`);
  }

  const child = spawn(executable, args, {
    cwd: options.cwd,
    env,
    stdio: [options.stdin ?? "ignore", options.stdout ?? "pipe", options.stderr ?? "pipe"],
  });
  const exited = new Promise<number>((resolve) => {
    child.once("error", () => resolve(1));
    child.once("close", (code) => resolve(code ?? 1));
  });

  return {
    stdout: child.stdout ? Readable.toWeb(child.stdout) : null,
    stderr: child.stderr ? Readable.toWeb(child.stderr) : null,
    exited,
    get exitCode() {
      return child.exitCode;
    },
    kill: (signal) => {
      child.kill(signal);
    },
  };
}

function bunFile(filePath: string): File {
  const bytes = readFileSync(filePath);
  return new File([bytes], path.basename(filePath));
}

const bunGlobal = {
  spawn: bunSpawn,
  spawnSync: bunSpawnSync,
  file: bunFile,
};

Object.defineProperty(globalThis, "Bun", {
  value: bunGlobal,
  configurable: true,
});
