import { describe, expect, test } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function withConfig<T>(fn: (env: Record<string, string>, configPath: string, configDir: string) => T): T {
  const configDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-auth-defaults-"));
  const configPath = path.join(configDir, "config.json");
  try {
    return fn({ PI_TUBE_CONFIG_PATH: configPath, DEEPGRAM_API_KEY: "", GROQ_API_KEY: "", ELEVENLABS_API_KEY: "", ELEVEN_API_KEY: "" }, configPath, configDir);
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
  test("validates auth login provider before prompting for an API key", () => withConfig((env) => {
    const login = runCli(["auth", "login"], env);

    expect(login.exitCode).toBe(2);
    expect(login.stdout.toString()).not.toContain("Paste provider API key");
    expect(login.stderr.toString()).toContain("[CLI_CONTRACT_VIOLATION] Missing provider.");
    expect(login.stderr.toString()).toContain("pi-tube auth login <deepgram|groq|elevenlabs>");
  }));

  test("logs in with a provider API key, masks status, and logs out", () => withConfig((env, configPath) => {
    const login = runCli(["auth", "login", "elevenlabs", "--key", "sk_eleven_secret_1234"], env);
    expect(login.exitCode).toBe(0);
    expect(login.stdout.toString()).toContain("[AUTH_LOGIN] provider=elevenlabs status=configured");
    expect(login.stdout.toString()).not.toContain("sk_eleven_secret_1234");

    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      providers: { elevenlabs: { api_key?: string } };
    };
    expect(config.providers.elevenlabs.api_key).toBe("sk_eleven_secret_1234");
    expect((statSync(configPath).mode & 0o777).toString(8)).toBe("600");

    const status = runCli(["auth", "status"], env);
    expect(status.exitCode).toBe(0);
    expect(status.stdout.toString()).toContain("elevenlabs configured=true source=config key=sk_e***1234");
    expect(status.stdout.toString()).not.toContain("sk_eleven_secret_1234");

    const logout = runCli(["auth", "logout", "elevenlabs"], env);
    expect(logout.exitCode).toBe(0);
    expect(logout.stdout.toString()).toContain("[AUTH_LOGOUT] provider=elevenlabs status=removed");
  }));

  test("sets and shows default provider and language", () => withConfig((env) => {
    const provider = runCli(["defaults", "provider", "elevenlabs"], env);
    expect(provider.exitCode).toBe(0);
    expect(provider.stdout.toString()).toContain("[DEFAULTS_SET] provider=elevenlabs");

    const language = runCli(["defaults", "language", "pt-BR"], env);
    expect(language.exitCode).toBe(0);
    expect(language.stdout.toString()).toContain("[DEFAULTS_SET] language=pt-br");

    const show = runCli(["defaults", "show"], env);
    expect(show.exitCode).toBe(0);
    expect(show.stdout.toString()).toContain("[DEFAULTS_SHOW]");
    expect(show.stdout.toString()).toContain("provider=elevenlabs");
    expect(show.stdout.toString()).toContain("language=pt-br");
  }));
});
