import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

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

function bunFile(filePath: string): File {
  const bytes = readFileSync(filePath);
  return new File([bytes], path.basename(filePath));
}

const bunGlobal = {
  spawnSync: bunSpawnSync,
  file: bunFile,
};

Object.defineProperty(globalThis, "Bun", {
  value: bunGlobal,
  configurable: true,
});
