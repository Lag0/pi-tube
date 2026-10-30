import { describe, expect, test } from "vitest";
import { createLoginProvider, createLogoutProvider, type EnvironmentVariables } from "../../../src/core/index.ts";
import { PROVIDER_DESCRIPTORS } from "../../../src/infrastructure/stt/registry.ts";
import { createInMemoryConfigStore, IN_MEMORY_CONFIG_LOCATION } from "../../helpers/in-memory-config-store.ts";

const setup = (env: EnvironmentVariables = {}) => {
  const configStore = createInMemoryConfigStore({
    version: 1,
    defaults: {},
    providers: { groq: { api_key_env: "MY_GROQ" } },
  });
  const deps = { configStore, env, providers: PROVIDER_DESCRIPTORS };
  return { configStore, login: createLoginProvider(deps), logout: createLogoutProvider(deps) };
};

describe("loginProvider", () => {
  test("stores the trimmed key and clears api_key_env", async () => {
    const { configStore, login } = setup();

    const result = await login({ provider: "groq", apiKey: "  sk-123\r\n" });

    expect(result).toEqual({ success: true, data: { provider: "groq", configLocation: IN_MEMORY_CONFIG_LOCATION } });
    expect(configStore.writes.at(-1)?.providers.groq).toEqual({ api_key: "sk-123" });
  });

  test("a key with inner whitespace is INPUT_INVALID and never echoed", async () => {
    const { configStore, login } = setup();

    const result = await login({ provider: "groq", apiKey: "secret part" });

    expect(result.success ? undefined : result.error.code).toBe("INPUT_INVALID");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(configStore.writes).toHaveLength(0);
  });

  test("an empty key is INPUT_INVALID", async () => {
    const { login } = setup();

    const result = await login({ provider: "groq", apiKey: "" });

    expect(result.success ? undefined : result.error.code).toBe("INPUT_INVALID");
  });

  test("an unknown provider is PROVIDER_INVALID", async () => {
    const { login } = setup();

    const result = await login({ provider: "openai", apiKey: "sk-1" });

    expect(result.success ? undefined : result.error.code).toBe("PROVIDER_INVALID");
  });

  test("reports the env var that overrides the stored key", async () => {
    const { login } = setup({ GROQ_API_KEY: "env-key" });

    const result = await login({ provider: "groq", apiKey: "sk-1" });

    expect(result.success ? result.data.overriddenByEnv : undefined).toBe("GROQ_API_KEY");
  });

  test("an aborted signal is CANCELLED and writes nothing", async () => {
    const { configStore, login } = setup();
    const controller = new AbortController();
    controller.abort();

    const result = await login({ provider: "groq", apiKey: "sk-1" }, { signal: controller.signal });

    expect(result.success ? undefined : result.error.code).toBe("CANCELLED");
    expect(configStore.writes).toHaveLength(0);
  });
});

describe("logoutProvider", () => {
  test("removes the stored key and api_key_env, and reports an env var still set", async () => {
    const { configStore, logout } = setup({ GROQ_API_KEY: "env-key" });

    const result = await logout({ provider: "groq" });

    expect(result).toEqual({
      success: true,
      data: { provider: "groq", configLocation: IN_MEMORY_CONFIG_LOCATION, stillSetInEnv: "GROQ_API_KEY" },
    });
    expect(configStore.writes.at(-1)?.providers.groq).toEqual({});
  });
});
