import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runCliInProcess } from "../helpers/cli-harness.ts";

const SECRET = "sk_eleven_secret_1234";
const TRUNCATED = '{"version": 1, "providers": {';

let configDir: string;
let configPath: string;

beforeEach(() => {
  configDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-auth-defaults-"));
  configPath = path.join(configDir, "config.json");
});

afterEach(() => {
  rmSync(configDir, { recursive: true, force: true });
});

const run = (args: string[], env: Record<string, string> = {}) =>
  runCliInProcess(args, { env: { PI_TUBE_CONFIG_PATH: configPath, ...env } });

describe("auth commands", () => {
  test("validates auth login provider before asking for an API key", async () => {
    const login = await run(["auth", "login"]);

    expect(login.exitCode).toBe(2);
    expect(login.stdout).toBe("");
    expect(login.stderr).toContain("[INPUT_INVALID] Missing provider.");
    expect(login.stderr).toContain("pi-tube auth login <deepgram|groq|elevenlabs>");
  });

  test("logs in, reports status without the key, and logs out", async () => {
    const login = await run(["auth", "login", "elevenlabs", "--key", SECRET]);
    expect(login.exitCode).toBe(0);
    expect(login.stdout).toBe(`[AUTH_LOGIN] provider=elevenlabs status=configured config_path=${configPath}\n`);
    expect(JSON.parse(readFileSync(configPath, "utf8")).providers.elevenlabs.api_key).toBe(SECRET);
    // Windows has no POSIX permission bits to assert on.
    if (process.platform !== "win32") {
      expect((statSync(configPath).mode & 0o777).toString(8)).toBe("600");
    }

    const status = await run(["auth", "status"]);
    expect(status.exitCode).toBe(0);
    expect(status.stdout).toContain("[PROVIDERS]");
    expect(status.stdout).toContain("elevenlabs configured=true key_source=config\n");

    const logout = await run(["auth", "logout", "elevenlabs"]);
    expect(logout.exitCode).toBe(0);
    expect(logout.stdout).toBe(`[AUTH_LOGOUT] provider=elevenlabs status=removed config_path=${configPath}\n`);
    expect(JSON.parse(readFileSync(configPath, "utf8")).providers.elevenlabs).toEqual({});

    for (const result of [login, status, logout]) {
      expect(result.stdout + result.stderr).not.toContain(SECRET);
    }
  });

  test("warns when an env var overrides the stored key", async () => {
    const login = await run(["auth", "login", "groq", "--key", "gsk_config_key"], { GROQ_API_KEY: "gsk_env_key" });

    expect(login.exitCode).toBe(0);
    expect(login.stderr).toBe("warning: GROQ_API_KEY in env overrides the key in config.json.\n");

    const providers = await run(["providers"], { GROQ_API_KEY: "gsk_env_key" });
    expect(providers.stdout).toContain("groq configured=true key_source=env env_name=GROQ_API_KEY\n");
    expect(providers.stdout + providers.stderr + login.stdout).not.toMatch(/gsk_config_key|gsk_env_key/);
  });

  test("warns on logout when an env var keeps the provider configured", async () => {
    const logout = await run(["auth", "logout", "groq"], { GROQ_API_KEY: "gsk_env_key" });

    expect(logout.exitCode).toBe(0);
    expect(logout.stderr).toBe("warning: GROQ_API_KEY is still set in env, so groq stays configured.\n");
  });

  test("emits JSON for login and logout", async () => {
    const login = await run(["auth", "login", "groq", "--key", "gsk_1", "--json"], { GROQ_API_KEY: "gsk_env" });
    const logout = await run(["auth", "logout", "groq", "--json"]);

    expect(JSON.parse(login.stdout)).toEqual({
      provider: "groq",
      status: "configured",
      config_path: configPath,
      overridden_by_env: "GROQ_API_KEY",
    });
    expect(login.stderr).toBe("");
    expect(JSON.parse(logout.stdout)).toEqual({
      provider: "groq",
      status: "removed",
      config_path: configPath,
      still_set_in_env: null,
    });
  });
});

describe("defaults commands", () => {
  test("sets and shows default provider and language", async () => {
    const provider = await run(["defaults", "provider", "ElevenLabs"]);
    expect(provider.exitCode).toBe(0);
    expect(provider.stdout).toBe(`[DEFAULTS_SET] provider=elevenlabs config_path=${configPath}\n`);

    const language = await run(["defaults", "language", "pt-BR"]);
    expect(language.exitCode).toBe(0);
    expect(language.stdout).toBe(`[DEFAULTS_SET] language=pt-br config_path=${configPath}\n`);

    const show = await run(["defaults", "show"]);
    expect(show.exitCode).toBe(0);
    expect(show.stdout).toBe(`[DEFAULTS_SHOW]\nconfig_path=${configPath}\nprovider=elevenlabs\nlanguage=pt-br\n`);
  });

  test("rejects an unknown default provider", async () => {
    const result = await run(["defaults", "provider", "openai"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("[PROVIDER_INVALID] Unknown provider `openai`.");
  });
});

describe("unreadable config", () => {
  test.each([[["config", "list"]], [["auth", "login", "groq", "--key", "k"]], [["defaults", "provider", "groq"]]])(
    "%j fails with CONFIG_INVALID and leaves the file untouched",
    async (args) => {
      writeFileSync(configPath, TRUNCATED);

      const result = await run(args);

      expect(result.exitCode).toBe(6);
      expect(result.stderr).toContain("[CONFIG_INVALID]");
      expect(readFileSync(configPath, "utf8")).toBe(TRUNCATED);
    },
  );

  test("a config path that is a directory fails with CONFIG_IO_FAILED", async () => {
    mkdirSync(configPath);

    const result = await run(["providers"]);

    expect(result.exitCode).toBe(6);
    expect(result.stderr).toContain("[CONFIG_IO_FAILED]");
  });
});
