import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { spawnCli } from "../helpers/spawn-cli.ts";

const BIN = path.resolve("bin", "pi-tube");

// The provider keys are blanked in every spawned env, and a blank variable already blocks `.env`.
// A custom `api_key_env` name that nothing else sets is what a loaded `.env` would leak.
const DOTENV_VAR = "PI_TUBE_DOTENV_PROBE_KEY";

let workDir: string;
let configPath: string;

beforeEach(() => {
  workDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-dotenv-"));
  configPath = path.join(workDir, "config.json");
  writeFileSync(path.join(workDir, ".env"), `${DOTENV_VAR}=from-dotenv\n`);
  writeFileSync(configPath, JSON.stringify({ providers: { groq: { api_key_env: DOTENV_VAR } } }));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

const groqKeySource = (stdout: string): unknown =>
  (JSON.parse(stdout) as { providers: Array<{ id: string; key_source: string }> }).providers.find(
    (provider) => provider.id === "groq",
  )?.key_source;

// Windows does not run a shebang directly.
describe.skipIf(process.platform === "win32")(".env in the working directory", () => {
  test("the installed bin ignores it", () => {
    const result = Bun.spawnSync({
      cmd: [BIN, "providers", "--json"],
      cwd: workDir,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, PI_TUBE_CONFIG_PATH: configPath, GROQ_API_KEY: "", [DOTENV_VAR]: undefined },
    });

    expect(result.exitCode).toBe(0);
    expect(groqKeySource(result.stdout.toString())).toBe("none");
  });

  test("the test spawn helper ignores it", () => {
    const result = spawnCli(["providers", "--json"], { PI_TUBE_CONFIG_PATH: configPath }, { cwd: workDir });

    expect(result.exitCode).toBe(0);
    expect(groqKeySource(result.stdout)).toBe("none");
  });
});
