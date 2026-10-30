import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type CliRunResult, runCliInProcess } from "../helpers/cli-harness.ts";

const KEYS = ["sk-1", "sk-2", "sk-3", "sk-line-a", "sk-line-b"];

let configDir: string;
let configPath: string;
const results: CliRunResult[] = [];

beforeEach(() => {
  configDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-auth-input-"));
  configPath = path.join(configDir, "config.json");
});

afterEach(() => {
  for (const result of results.splice(0)) {
    for (const key of KEYS) expect(result.stdout + result.stderr).not.toContain(key);
  }
  rmSync(configDir, { recursive: true, force: true });
});

const login = async (args: string[], options: { stdin?: string; secret?: string } = {}) => {
  const result = await runCliInProcess(["auth", "login", "groq", ...args], {
    env: { PI_TUBE_CONFIG_PATH: configPath },
    ...options,
  });
  results.push(result);
  return result;
};

const storedKey = (): unknown => JSON.parse(readFileSync(configPath, "utf8")).providers.groq.api_key;

describe("auth login key input", () => {
  test("--stdin accepts a key with a trailing CRLF", async () => {
    const result = await login(["--stdin"], { stdin: "sk-1\r\n" });

    expect(result.exitCode).toBe(0);
    expect(result.stdinRead).toBe(true);
    expect(storedKey()).toBe("sk-1");
  });

  test("--stdin with two lines is INPUT_INVALID", async () => {
    const result = await login(["--stdin"], { stdin: "sk-line-a\nsk-line-b\n" });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("[INPUT_INVALID]");
    expect(existsSync(configPath)).toBe(false);
  });

  test("a terminal gets the hidden prompt", async () => {
    const result = await login([], { secret: "sk-2" });

    expect(result.exitCode).toBe(0);
    expect(storedKey()).toBe("sk-2");
  });

  test("without a terminal and without --stdin it fails fast and never reads stdin", async () => {
    const result = await login([]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("[INPUT_INVALID] No API key input: stdin is not a terminal.");
    expect(result.stderr).toContain("--stdin");
    expect(result.stderr).toContain("GROQ_API_KEY");
    expect(result.stdinRead).toBe(false);
  });

  test("--key is refused and nothing is stored", async () => {
    const result = await login(["--key", "sk-3"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("[INPUT_INVALID]");
    expect(existsSync(configPath)).toBe(false);
  });

  test("an unknown provider fails before asking for the key", async () => {
    const result = await runCliInProcess(["auth", "login", "openai", "--stdin"], {
      env: { PI_TUBE_CONFIG_PATH: configPath },
      stdin: "sk-1",
    });
    results.push(result);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("[PROVIDER_INVALID]");
    expect(result.stdinRead).toBe(false);
  });
});
