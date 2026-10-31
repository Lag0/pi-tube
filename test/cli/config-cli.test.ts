import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import { runCliInProcess } from "../helpers/cli-harness.ts";
import { fakeProviders, PROVIDER_KEYS, transcript } from "../helpers/transcribe-fakes.ts";
import { readOutputFileFromStdout } from "./output-file.ts";

const outputDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-cli-config-output-"));

afterAll(() => {
  rmSync(outputDir, { recursive: true, force: true });
});

let configDir: string;
let configPath: string;

beforeEach(() => {
  configDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-config-cli-"));
  configPath = path.join(configDir, "config.json");
});

afterEach(() => {
  rmSync(configDir, { recursive: true, force: true });
});

const run = (args: string[]) => runCliInProcess(args, { env: { PI_TUBE_CONFIG_PATH: configPath } });

describe("config command", () => {
  test("sets, gets and lists values in text mode", async () => {
    const set = await run(["config", "set", "defaults.provider", "GROQ"]);
    expect(set.exitCode).toBe(0);
    expect(set.stdout).toBe(`[CONFIG_SET] key=defaults.provider value=groq config_path=${configPath}\n`);

    const get = await run(["config", "get", "defaults.provider"]);
    expect(get.stdout).toBe(`[CONFIG_GET] key=defaults.provider value=groq config_path=${configPath}\n`);

    const unset = await run(["config", "get", "defaults.language"]);
    expect(unset.stdout).toBe(`[CONFIG_GET] key=defaults.language value=(unset) config_path=${configPath}\n`);

    const list = await run(["config", "list"]);
    expect(list.stdout).toBe(
      [
        "[CONFIG_LIST]",
        `config_path=${configPath}`,
        "defaults.provider=groq",
        "defaults.language=(unset)",
        "providers.deepgram.api_key_env=(unset)",
        "providers.groq.api_key_env=(unset)",
        "providers.elevenlabs.api_key_env=(unset)",
        "",
      ].join("\n"),
    );
  });

  test("emits JSON for set, get and list", async () => {
    const set = await run(["config", "set", "providers.groq.api_key_env", "MY_GROQ", "--json"]);
    const get = await run(["config", "get", "providers.groq.api_key_env", "--json"]);
    const list = await run(["config", "list", "--json"]);

    const expected = { key: "providers.groq.api_key_env", value: "MY_GROQ", config_path: configPath };
    expect(JSON.parse(set.stdout)).toEqual(expected);
    expect(JSON.parse(get.stdout)).toEqual(expected);
    expect(JSON.parse(list.stdout)).toEqual({
      config_path: configPath,
      values: {
        "defaults.provider": null,
        "defaults.language": null,
        "providers.deepgram.api_key_env": null,
        "providers.groq.api_key_env": "MY_GROQ",
        "providers.elevenlabs.api_key_env": null,
      },
    });
  });

  test("writing the same value twice keeps identical bytes", async () => {
    await run(["config", "set", "defaults.language", "pt-BR"]);
    const first = readFileSync(configPath, "utf8");
    await run(["config", "set", "defaults.language", "pt-br"]);

    expect(readFileSync(configPath, "utf8")).toBe(first);
  });

  test("refuses API keys and points to auth login without echoing the value", async () => {
    const result = await run(["config", "set", "providers.groq.api_key", "gsk_very_secret_token"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("[INPUT_INVALID]");
    expect(result.stderr).toContain("auth login groq");
    expect(result.stdout + result.stderr).not.toContain("gsk_very_secret_token");
  });

  test("refuses an api_key_env that is not an env var name", async () => {
    const result = await run(["config", "set", "providers.groq.api_key_env", "gsk_very_secret_token"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("environment variable name");
    expect(result.stderr).not.toContain("gsk_very_secret_token");
  });

  test("rejects an unknown provider as PROVIDER_INVALID", async () => {
    const result = await run(["config", "set", "defaults.provider", "invalid-provider"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("[PROVIDER_INVALID]");
  });

  test("the removed provider/language aliases are INPUT_INVALID", async () => {
    const result = await run(["config", "provider", "set", "groq"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("[INPUT_INVALID]");
  });
});

describe("defaults in transcription", () => {
  const transcribe = (env: Record<string, string> = {}) =>
    runCliInProcess(["transcribe", "https://cdn.example.com/audio/demo.wav"], {
      env: { PI_TUBE_CONFIG_PATH: configPath, PI_TUBE_OUTPUT_DIR: outputDir, ...PROVIDER_KEYS, ...env },
      fakes: { stt: fakeProviders({ groq: transcript("config provider", "pt") }) },
    });

  test("uses the config defaults for provider and language when nothing else is set", async () => {
    expect((await run(["config", "set", "defaults.provider", "groq"])).exitCode).toBe(0);
    expect((await run(["config", "set", "defaults.language", "pt-BR"])).exitCode).toBe(0);

    const result = await transcribe();
    const output = readOutputFileFromStdout(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(output).toContain('provider: "groq"');
    expect(output).toContain('requested_language: "pt-br"');
    expect(output).toContain("config provider");
  });

  test("PI_TUBE_TRANSCRIPTION_PROVIDER and PI_TUBE_TRANSCRIPTION_LANGUAGE win over the config defaults", async () => {
    await run(["config", "set", "defaults.provider", "groq"]);
    await run(["config", "set", "defaults.language", "pt-BR"]);

    const result = await transcribe({
      PI_TUBE_TRANSCRIPTION_PROVIDER: "deepgram",
      PI_TUBE_TRANSCRIPTION_LANGUAGE: "en",
    });
    const output = readOutputFileFromStdout(result.stdout);

    expect(output).toContain('provider: "deepgram"');
    expect(output).toContain('requested_language: "en"');
  });
});
