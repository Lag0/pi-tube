import { describe, expect, test } from "vitest";
import { createError, createListProviders } from "../../../src/core/index.ts";
import { PROVIDER_DESCRIPTORS } from "../../../src/infrastructure/stt/registry.ts";
import { createInMemoryConfigStore, IN_MEMORY_CONFIG_LOCATION } from "../../helpers/in-memory-config-store.ts";

describe("listProviders", () => {
  test("lists every provider in registry order with its key source", async () => {
    const configStore = createInMemoryConfigStore({
      version: 1,
      defaults: {},
      providers: { groq: { api_key: "gq" }, elevenlabs: { api_key: "el" } },
    });
    const listProviders = createListProviders({
      configStore,
      env: { GROQ_API_KEY: "env-gq" },
      providers: PROVIDER_DESCRIPTORS,
    });

    const result = await listProviders({});

    expect(result).toEqual({
      success: true,
      data: {
        configLocation: IN_MEMORY_CONFIG_LOCATION,
        providers: [
          {
            id: "deepgram",
            positioning: "best_value",
            configured: false,
            keySource: "none",
            overridesConfigKey: false,
          },
          {
            id: "groq",
            positioning: "best_value",
            configured: true,
            keySource: "env",
            envName: "GROQ_API_KEY",
            overridesConfigKey: true,
          },
          {
            id: "elevenlabs",
            positioning: "highest_accuracy",
            configured: true,
            keySource: "config",
            overridesConfigKey: false,
          },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/env-gq|"gq"|"el"/);
  });

  test("propagates a config store failure", async () => {
    const configStore = createInMemoryConfigStore(createError("CONFIG_INVALID", "broken"));
    const listProviders = createListProviders({ configStore, env: {}, providers: PROVIDER_DESCRIPTORS });

    const result = await listProviders({});

    expect(result.success ? undefined : result.error.code).toBe("CONFIG_INVALID");
  });
});
