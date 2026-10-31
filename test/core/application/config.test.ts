import { describe, expect, test } from "vitest";
import {
  createGetConfigValue,
  createListConfigValues,
  createSetConfigValue,
  DEFAULT_CONFIG,
} from "../../../src/core/index.ts";
import { PROVIDER_DESCRIPTORS } from "../../../src/infrastructure/stt/registry.ts";
import { createInMemoryConfigStore, IN_MEMORY_CONFIG_LOCATION } from "../../helpers/in-memory-config-store.ts";

const setup = () => {
  const configStore = createInMemoryConfigStore(DEFAULT_CONFIG);
  const deps = { configStore, providers: PROVIDER_DESCRIPTORS };
  return {
    configStore,
    getValue: createGetConfigValue(deps),
    setValue: createSetConfigValue(deps),
    listValues: createListConfigValues(deps),
  };
};

describe("setConfigValue", () => {
  test("normalizes defaults.provider", async () => {
    const { configStore, setValue } = setup();

    const result = await setValue({ key: "defaults.provider", value: "GROQ" });

    expect(result).toEqual({
      success: true,
      data: { key: "defaults.provider", value: "groq", configLocation: IN_MEMORY_CONFIG_LOCATION },
    });
    expect(configStore.writes.at(-1)?.defaults.provider).toBe("groq");
  });

  test("lowercases defaults.language", async () => {
    const { setValue } = setup();

    const result = await setValue({ key: "defaults.language", value: "pt-BR" });

    expect(result.success ? result.data.value : undefined).toBe("pt-br");
  });

  test("refuses API keys and points to auth login", async () => {
    const { configStore, setValue } = setup();

    const result = await setValue({ key: "providers.groq.api_key", value: "sk-secret" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("INPUT_INVALID");
    expect(result.error.hint).toContain("auth login groq");
    expect(JSON.stringify(result)).not.toContain("sk-secret");
    expect(configStore.writes).toHaveLength(0);
  });

  test("refuses an api_key_env that is not an env var name", async () => {
    const { setValue } = setup();

    const result = await setValue({ key: "providers.groq.api_key_env", value: "lower" });

    expect(result.success ? undefined : result.error.code).toBe("INPUT_INVALID");
  });

  test("refuses an unknown key", async () => {
    const { setValue } = setup();

    const result = await setValue({ key: "defaults.color", value: "blue" });

    expect(result.success ? undefined : result.error.code).toBe("INPUT_INVALID");
  });

  test("refuses an empty value", async () => {
    const { setValue } = setup();

    const result = await setValue({ key: "defaults.language", value: "  " });

    expect(result.success ? undefined : result.error.code).toBe("INPUT_INVALID");
  });
});

describe("getConfigValue", () => {
  test("returns the stored value", async () => {
    const { setValue, getValue } = setup();
    await setValue({ key: "providers.groq.api_key_env", value: "MY_GROQ" });

    const result = await getValue({ key: "providers.groq.api_key_env" });

    expect(result).toEqual({
      success: true,
      data: { key: "providers.groq.api_key_env", value: "MY_GROQ", configLocation: IN_MEMORY_CONFIG_LOCATION },
    });
  });

  test("refuses to read an API key", async () => {
    const { getValue } = setup();

    const result = await getValue({ key: "providers.groq.api_key" });

    expect(result.success ? undefined : result.error.code).toBe("INPUT_INVALID");
  });
});

describe("listConfigValues", () => {
  test("lists exactly the ten keys", async () => {
    const { listValues } = setup();

    const result = await listValues({});

    expect(result.success ? Object.keys(result.data.values) : undefined).toEqual([
      "defaults.provider",
      "defaults.language",
      "network.allow_private_hosts",
      "cookies.file",
      "local_files.max_bytes",
      "library.keep_audio",
      "library.max_audio_bytes",
      "providers.deepgram.api_key_env",
      "providers.groq.api_key_env",
      "providers.elevenlabs.api_key_env",
    ]);
  });
});
