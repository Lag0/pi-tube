import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readOutputFileFromStdout } from "./output-file.ts";
import {
  getConfigValue,
  listConfigValues,
  resolveConfigPath,
  setConfigValue,
} from "../../src/config/store.ts";

const outputDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-cli-config-output-"));

afterAll(() => {
  rmSync(outputDir, { recursive: true, force: true });
});

function runCli(args: string[], env: Record<string, string> = {}) {
  return Bun.spawnSync({
    cmd: ["bun", "run", "--bun", "bin/pi-tube.ts", ...args],
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, PI_TUBE_OUTPUT_DIR: outputDir, ...env },
  });
}

describe("config store", () => {
  test("resolves explicit config path for test isolation", () => {
    const cwd = process.cwd();
    const configPath = resolveConfigPath({
      cwd,
      env: { PI_TUBE_CONFIG_PATH: ".tmp/pi-tube-test-config.json" },
    });

    expect(configPath).toBe(path.join(cwd, ".tmp/pi-tube-test-config.json"));
  });

  test("uses ~/.pi-tube/config.json as default home config path", () => {
    const configPath = resolveConfigPath({
      env: { HOME: "/tmp/pi-tube-home" },
    });

    expect(configPath).toBe("/tmp/pi-tube-home/.pi-tube/config.json");
  });

  test("supports deterministic set/get/list and stable serialization", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-config-store-"));
    const configPath = path.join(tempDir, "config.json");

    try {
      const options = { env: { PI_TUBE_CONFIG_PATH: configPath } };

      setConfigValue("defaults.provider", "groq", options);
      setConfigValue("providers.groq.api_key_env", "PI_TUBE_GROQ_KEY", options);
      setConfigValue("defaults.language", "PT-BR", options);

      expect(getConfigValue("defaults.provider", options)).toBe("groq");
      expect(getConfigValue("providers.groq.api_key_env", options)).toBe("PI_TUBE_GROQ_KEY");
      expect(getConfigValue("defaults.language", options)).toBe("pt-br");

      const listed = listConfigValues(options);
      expect(listed["defaults.provider"]).toBe("groq");
      expect(listed["providers.groq.api_key_env"]).toBe("PI_TUBE_GROQ_KEY");
      expect(listed["defaults.language"]).toBe("pt-br");

      const firstWrite = readFileSync(configPath, "utf8");
      setConfigValue("defaults.language", "pt-br", options);
      const secondWrite = readFileSync(configPath, "utf8");
      expect(secondWrite).toBe(firstWrite);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("config command integration", () => {
  test("supports friendly provider/language aliases while preserving legacy dot-path compatibility", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-config-friendly-"));
    const configPath = path.join(tempDir, "config.json");

    try {
      const env = { PI_TUBE_CONFIG_PATH: configPath };

      const providerSet = runCli(["config", "provider", "set", "groq"], env);
      expect(providerSet.exitCode).toBe(0);
      expect(providerSet.stdout.toString()).toContain("[CONFIG_SET] key=defaults.provider value=groq");

      const providerGet = runCli(["config", "provider", "get"], env);
      expect(providerGet.exitCode).toBe(0);
      expect(providerGet.stdout.toString()).toContain("[CONFIG_GET] key=defaults.provider value=groq");

      const providerEnv = runCli(["config", "provider", "env", "groq", "GROQ_API_KEY"], env);
      expect(providerEnv.exitCode).toBe(0);
      expect(providerEnv.stdout.toString()).toContain("key=providers.groq.api_key_env value=GROQ_API_KEY");

      const languageSet = runCli(["config", "language", "set", "pt-BR"], env);
      expect(languageSet.exitCode).toBe(0);
      expect(languageSet.stdout.toString()).toContain("[CONFIG_SET] key=defaults.language value=pt-br");

      const legacyGet = runCli(["config", "get", "providers.groq.api_key_env"], env);
      expect(legacyGet.exitCode).toBe(0);
      expect(legacyGet.stdout.toString()).toContain("[CONFIG_GET] key=providers.groq.api_key_env value=GROQ_API_KEY");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("supports deterministic set/get/list output in text and json modes", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-config-cli-"));
    const configPath = path.join(tempDir, "config.json");

    try {
      const env = { PI_TUBE_CONFIG_PATH: configPath };
      const setResult = runCli(["config", "set", "defaults.provider", "groq"], env);
      expect(setResult.exitCode).toBe(0);
      expect(setResult.stdout.toString()).toContain("[CONFIG_SET] key=defaults.provider value=groq");

      const getResult = runCli(["config", "get", "defaults.provider"], env);
      expect(getResult.exitCode).toBe(0);
      expect(getResult.stdout.toString()).toContain("[CONFIG_GET] key=defaults.provider value=groq");

      const listResult = runCli(["--json", "config", "list"], env);
      expect(listResult.exitCode).toBe(0);
      const payload = JSON.parse(listResult.stdout.toString()) as {
        command: string;
        action: string;
        values: Record<string, string | null>;
      };
      expect(payload.command).toBe("config");
      expect(payload.action).toBe("list");
      expect(payload.values["defaults.provider"]).toBe("groq");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("uses config defaults for provider and language when CLI flags are omitted", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-config-precedence-"));
    const configPath = path.join(tempDir, "config.json");
    const mediaUrl = "https://cdn.example.com/audio/demo.wav";

    try {
      const env = { PI_TUBE_CONFIG_PATH: configPath };
      expect(runCli(["config", "set", "defaults.provider", "groq"], env).exitCode).toBe(0);
      expect(runCli(["config", "set", "defaults.language", "pt-BR"], env).exitCode).toBe(0);

      const runResult = runCli([mediaUrl], {
        ...env,
        PI_TUBE_TRANSCRIPTION_PROVIDER: "deepgram",
        PI_TUBE_TRANSCRIPTION_LANGUAGE: "en",
        PI_TUBE_TEST_GROQ_RESPONSE: JSON.stringify({ text: "config provider", language: "pt" }),
        PI_TUBE_TEST_DEEPGRAM_RESPONSE: JSON.stringify({
          results: { channels: [{ alternatives: [{ transcript: "env provider" }] }] },
        }),
      });

      const output = readOutputFileFromStdout(runResult.stdout.toString());
      expect(runResult.exitCode).toBe(0);
      expect(output).toContain('provider: "groq"');
      expect(output).toContain('requested_language: "pt-br"');
      expect(output).toContain("config provider");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
