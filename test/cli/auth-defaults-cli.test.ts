import { describe, expect, test } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function withConfig<T>(fn: (env: Record<string, string>, configPath: string, configDir: string) => T): T {
  const configDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-auth-defaults-"));
  const configPath = path.join(configDir, "config.json");
  try {
    return fn({ PI_TUBE_CONFIG_PATH: configPath, DEEPGRAM_API_KEY: "", GROQ_API_KEY: "" }, configPath, configDir);
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
}

function runCli(args: string[], env: Record<string, string> = {}) {
  return Bun.spawnSync({
    cmd: ["bun", "run", "--bun", "bin/pi-tube.ts", ...args],
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });
}

describe("auth and defaults commands", () => {
  test("logs in with a provider API key, masks status, and logs out", () => withConfig((env, configPath) => {
    const login = runCli(["auth", "login", "groq", "--key", "gsk_test_secret_1234"], env);
    expect(login.exitCode).toBe(0);
    expect(login.stdout.toString()).toContain("[AUTH_LOGIN] provider=groq status=configured");
    expect(login.stdout.toString()).not.toContain("gsk_test_secret_1234");

    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      providers: { groq: { api_key?: string } };
    };
    expect(config.providers.groq.api_key).toBe("gsk_test_secret_1234");
    expect((statSync(configPath).mode & 0o777).toString(8)).toBe("600");

    const status = runCli(["auth", "status"], env);
    expect(status.exitCode).toBe(0);
    expect(status.stdout.toString()).toContain("groq configured=true source=config key=gsk_***1234");
    expect(status.stdout.toString()).not.toContain("gsk_test_secret_1234");

    const logout = runCli(["auth", "logout", "groq"], env);
    expect(logout.exitCode).toBe(0);
    expect(logout.stdout.toString()).toContain("[AUTH_LOGOUT] provider=groq status=removed");
  }));

  test("sets and shows default provider and language", () => withConfig((env) => {
    const provider = runCli(["defaults", "provider", "groq"], env);
    expect(provider.exitCode).toBe(0);
    expect(provider.stdout.toString()).toContain("[DEFAULTS_SET] provider=groq");

    const language = runCli(["defaults", "language", "pt-BR"], env);
    expect(language.exitCode).toBe(0);
    expect(language.stdout.toString()).toContain("[DEFAULTS_SET] language=pt-br");

    const show = runCli(["defaults", "show"], env);
    expect(show.exitCode).toBe(0);
    expect(show.stdout.toString()).toContain("[DEFAULTS_SHOW]");
    expect(show.stdout.toString()).toContain("provider=groq");
    expect(show.stdout.toString()).toContain("language=pt-br");
  }));
});
