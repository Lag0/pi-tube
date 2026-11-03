import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const BIN = path.resolve("bin", "pi-tube.ts");
/** The temp root every spawned CLI runs under: its HOME, config path and library. */
export const SPAWN_ROOT = mkdtempSync(path.join(os.tmpdir(), "pi-tube-spawn-"));
process.once("exit", () => rmSync(SPAWN_ROOT, { recursive: true, force: true }));

/** Env that keeps a spawned CLI off the developer's real keys, config and `~/.pi-tube`. */
export const HERMETIC_ENV: Readonly<Record<string, string>> = {
  HOME: SPAWN_ROOT,
  DEEPGRAM_API_KEY: "",
  GROQ_API_KEY: "",
  ELEVENLABS_API_KEY: "",
  ELEVEN_API_KEY: "",
  PI_TUBE_TRANSCRIPTION_PROVIDER: "",
  PI_TUBE_TRANSCRIPTION_LANGUAGE: "",
  PI_TUBE_CONFIG_PATH: path.join(SPAWN_ROOT, "missing.json"),
  PI_TUBE_LIBRARY_DIR: path.join(SPAWN_ROOT, "library"),
  // Read by the v2 import; a developer's own value must never reach a spawned CLI.
  PI_TUBE_OUTPUT_DIR: "",
};

export interface SpawnCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs the real `bin/pi-tube.ts` in a child process. `env` is merged over the hermetic defaults. */
export const spawnCli = (
  args: string[],
  env: Record<string, string> = {},
  options: { cwd?: string } = {},
): SpawnCliResult => {
  const result = Bun.spawnSync({
    cmd: ["bun", "run", "--bun", "--no-env-file", BIN, ...args],
    stdout: "pipe",
    stderr: "pipe",
    cwd: options.cwd,
    env: { ...process.env, ...HERMETIC_ENV, ...env },
  });
  return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
};

export interface SpawnMcpResult {
  readonly exitCode: number | null;
  readonly stdoutLines: readonly string[];
  readonly stderr: string;
  /** With `signalAfterMs`: how long the server took to exit after SIGTERM. */
  readonly exitedAfterSignalMs?: number;
}

/**
 * Runs `bin/pi-tube.ts mcp` in a child process and writes one JSON line per message. Once every message with an
 * `id` has an answer, it ends stdin, or sends SIGTERM `signalAfterMs` later. Killed after `timeoutMs` (20 s).
 */
export const spawnMcp = (
  messages: readonly object[],
  env: Record<string, string> = {},
  options: { readonly timeoutMs?: number; readonly signalAfterMs?: number } = {},
): Promise<SpawnMcpResult> =>
  new Promise((resolve) => {
    const child = spawn("bun", ["run", "--bun", "--no-env-file", BIN, "mcp"], {
      env: { ...process.env, ...HERMETIC_ENV, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const expected = messages.filter((message) => "id" in message).length;
    let stdout = "";
    let stderr = "";
    let signalledAt: number | undefined;
    let finishing = false;
    const answered = (): number =>
      stdout
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .filter((line) => {
          try {
            const parsed: unknown = JSON.parse(line);
            return typeof parsed === "object" && parsed !== null && "id" in parsed && !("method" in parsed);
          } catch {
            return false;
          }
        }).length;
    const finish = (): void => {
      if (finishing) return;
      finishing = true;
      if (options.signalAfterMs === undefined) {
        child.stdin.end();
        return;
      }
      setTimeout(() => {
        signalledAt = Date.now();
        child.kill("SIGTERM");
      }, options.signalAfterMs);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (answered() >= expected) finish();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 20_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code,
        stdoutLines: stdout.split("\n").filter((line) => line.length > 0),
        stderr,
        ...(signalledAt === undefined ? {} : { exitedAfterSignalMs: Date.now() - signalledAt }),
      });
    });
    for (const message of messages) child.stdin.write(`${JSON.stringify(message)}\n`);
    if (expected === 0) finish();
  });
