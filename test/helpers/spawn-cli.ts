import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const BIN = path.resolve("bin", "pi-tube.ts");
const SPAWN_ROOT = mkdtempSync(path.join(os.tmpdir(), "pi-tube-spawn-"));
process.once("exit", () => rmSync(SPAWN_ROOT, { recursive: true, force: true }));

/** Env that keeps a spawned CLI off the developer's real keys, config and `~/.pi-tube`. */
const HERMETIC_ENV = {
  DEEPGRAM_API_KEY: "",
  GROQ_API_KEY: "",
  ELEVENLABS_API_KEY: "",
  ELEVEN_API_KEY: "",
  PI_TUBE_TRANSCRIPTION_PROVIDER: "",
  PI_TUBE_TRANSCRIPTION_LANGUAGE: "",
  PI_TUBE_CONFIG_PATH: path.join(SPAWN_ROOT, "missing.json"),
  PI_TUBE_OUTPUT_DIR: SPAWN_ROOT,
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
    cmd: ["bun", "run", "--bun", BIN, ...args],
    stdout: "pipe",
    stderr: "pipe",
    cwd: options.cwd,
    env: { ...process.env, ...HERMETIC_ENV, ...env },
  });
  return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
};
