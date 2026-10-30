import { describe, expect, test } from "vitest";
import type { PiTubeConfig } from "../../../src/core/domain/config.ts";
import { findProvider, resolveCredential } from "../../../src/core/domain/providers.ts";
import { PROVIDER_DESCRIPTORS } from "../../../src/infrastructure/stt/registry.ts";

const [, groq, elevenlabs] = PROVIDER_DESCRIPTORS;
if (!groq || !elevenlabs) throw new Error("registry must list deepgram, groq and elevenlabs");

const config = (providers: PiTubeConfig["providers"]): PiTubeConfig => ({ version: 1, defaults: {}, providers });

describe("resolveCredential", () => {
  test("a default env var wins over the config key and flags the override", () => {
    expect(resolveCredential(groq, config({ groq: { api_key: "from-config" } }), { GROQ_API_KEY: "from-env" })).toEqual(
      { source: "env", apiKey: "from-env", envName: "GROQ_API_KEY", overridesConfigKey: true },
    );
  });

  test("api_key_env from config is read first", () => {
    const resolved = resolveCredential(groq, config({ groq: { api_key_env: "MY_GROQ" } }), {
      MY_GROQ: "custom",
      GROQ_API_KEY: "default",
    });

    expect(resolved).toEqual({ source: "env", apiKey: "custom", envName: "MY_GROQ", overridesConfigKey: false });
  });

  test("an empty api_key_env variable falls through to the default name", () => {
    const resolved = resolveCredential(groq, config({ groq: { api_key_env: "MY_GROQ" } }), {
      MY_GROQ: "",
      GROQ_API_KEY: "default",
    });

    expect(resolved.envName).toBe("GROQ_API_KEY");
  });

  test("only the config key gives source config", () => {
    expect(resolveCredential(groq, config({ groq: { api_key: "from-config" } }), {})).toEqual({
      source: "config",
      apiKey: "from-config",
      overridesConfigKey: false,
    });
  });

  test("nothing gives source none", () => {
    expect(resolveCredential(groq, config({}), {})).toEqual({ source: "none", overridesConfigKey: false });
  });

  test("a blank env value is ignored", () => {
    expect(resolveCredential(groq, config({}), { GROQ_API_KEY: "   " }).source).toBe("none");
  });

  test("ELEVEN_API_KEY alone configures elevenlabs", () => {
    expect(resolveCredential(elevenlabs, config({}), { ELEVEN_API_KEY: "el" })).toMatchObject({
      source: "env",
      envName: "ELEVEN_API_KEY",
    });
  });
});

describe("findProvider", () => {
  test("trims and lowercases the id", () => {
    const found = findProvider(PROVIDER_DESCRIPTORS, " GROQ ");

    expect(found.success ? found.data.id : undefined).toBe("groq");
  });

  test("an unknown id is PROVIDER_INVALID listing the known ids", () => {
    const found = findProvider(PROVIDER_DESCRIPTORS, "openai");

    expect(found).toEqual({
      success: false,
      error: {
        code: "PROVIDER_INVALID",
        message: "Unknown provider `openai`.",
        hint: "Use one of: deepgram, groq, elevenlabs.",
      },
    });
  });
});
