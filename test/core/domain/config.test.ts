import { describe, expect, test } from "vitest";
import {
  applyConfigValue,
  configKeysFor,
  DEFAULT_CONFIG,
  getConfigValue,
  parseConfig,
} from "../../../src/core/domain/config.ts";
import { PROVIDER_DESCRIPTORS } from "../../../src/infrastructure/stt/registry.ts";

const LOCATION = "/home/u/.pi-tube/config.json";

describe("parseConfig", () => {
  test("parses a complete v2 config unchanged", () => {
    const v2 = {
      version: 1,
      defaults: { provider: "groq", language: "pt" },
      providers: {
        deepgram: { api_key: "dg-key", api_key_env: "MY_DG" },
        groq: { api_key: "gq-key", api_key_env: "MY_GROQ" },
        elevenlabs: { api_key: "el-key", api_key_env: "MY_EL" },
      },
    };

    const result = parseConfig(v2, LOCATION);

    expect(result).toEqual({ success: true, data: v2 });
  });

  test("rejects providers that is not an object", () => {
    const result = parseConfig({ providers: [] }, LOCATION);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("CONFIG_INVALID");
    expect(result.error.message).toBe(`Config file ${LOCATION} is invalid: \`providers\` must be an object.`);
  });

  test("rejects a non-string defaults.provider", () => {
    const result = parseConfig({ defaults: { provider: 3 } }, LOCATION);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("CONFIG_INVALID");
    expect(result.error.message).toContain("`defaults.provider`");
  });

  test("accepts an unknown provider id in defaults; semantics are checked on use", () => {
    const result = parseConfig({ defaults: { provider: "openai" } }, LOCATION);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.defaults.provider).toBe("openai");
  });

  test("trims strings and drops empty ones", () => {
    const result = parseConfig({ defaults: { language: "  " }, providers: { groq: { api_key: " k " } } }, LOCATION);

    expect(result).toEqual({
      success: true,
      data: { version: 1, defaults: {}, providers: { groq: { api_key: "k" } } },
    });
  });
});

describe("source sections", () => {
  test("parses network, cookies and local_files", () => {
    const raw = {
      version: 1,
      defaults: {},
      providers: {},
      network: { allow_private_hosts: true },
      cookies: { file: "/Users/me/cookies.txt" },
      local_files: { max_bytes: 1048576 },
    };

    expect(parseConfig(raw, LOCATION)).toEqual({ success: true, data: raw });
  });

  test.each([
    [{ network: { allow_private_hosts: "yes" } }, "`network.allow_private_hosts` must be a boolean."],
    [{ cookies: { file: 1 } }, "`cookies.file` must be a string."],
    [{ local_files: { max_bytes: 0 } }, "`local_files.max_bytes` must be an integer from 1 to 2147483647."],
    [{ local_files: { max_bytes: 2147483648 } }, "`local_files.max_bytes` must be an integer from 1 to 2147483647."],
    [{ local_files: { max_bytes: 12.5 } }, "`local_files.max_bytes` must be an integer from 1 to 2147483647."],
    [{ network: [] }, "`network` must be an object."],
  ])("rejects %j", (raw, detail) => {
    const result = parseConfig(raw, LOCATION);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("CONFIG_INVALID");
    expect(result.error.message).toBe(`Config file ${LOCATION} is invalid: ${detail}`);
  });
});

describe("config keys", () => {
  test("lists the source keys after the defaults and before the provider env names", () => {
    expect(configKeysFor(PROVIDER_DESCRIPTORS)).toEqual([
      "defaults.provider",
      "defaults.language",
      "network.allow_private_hosts",
      "cookies.file",
      "local_files.max_bytes",
      "providers.deepgram.api_key_env",
      "providers.groq.api_key_env",
      "providers.elevenlabs.api_key_env",
    ]);
  });

  test.each([
    ["TRUE", true],
    ["false", false],
  ])("network.allow_private_hosts accepts %s", (value, expected) => {
    const result = applyConfigValue(DEFAULT_CONFIG, "network.allow_private_hosts", value, PROVIDER_DESCRIPTORS);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(getConfigValue(result.data, "network.allow_private_hosts")).toBe(expected);
  });

  test("network.allow_private_hosts refuses anything but true or false", () => {
    const result = applyConfigValue(DEFAULT_CONFIG, "network.allow_private_hosts", "yes", PROVIDER_DESCRIPTORS);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatchObject({
      code: "INPUT_INVALID",
      message: "`network.allow_private_hosts` must be true or false.",
      hint: "Use `true` or `false`.",
    });
  });

  test.each([
    "/Users/me/cookies.txt",
    "C:\\Users\\me\\cookies.txt",
    "C:/Users/me/cookies.txt",
    "\\\\server\\share\\c.txt",
  ])("cookies.file accepts the absolute path %s", (value) => {
    const result = applyConfigValue(DEFAULT_CONFIG, "cookies.file", value, PROVIDER_DESCRIPTORS);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(getConfigValue(result.data, "cookies.file")).toBe(value);
  });

  test("cookies.file refuses a relative path", () => {
    const result = applyConfigValue(DEFAULT_CONFIG, "cookies.file", "cookies.txt", PROVIDER_DESCRIPTORS);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toMatchObject({
      code: "INPUT_INVALID",
      message: "`cookies.file` must be an absolute path.",
      hint: "Use an absolute path, such as /Users/me/cookies.txt or C:\\Users\\me\\cookies.txt.",
    });
  });

  test.each(["0", "-1", "1e9", "2147483648", "12.5"])("local_files.max_bytes refuses %s", (value) => {
    const result = applyConfigValue(DEFAULT_CONFIG, "local_files.max_bytes", value, PROVIDER_DESCRIPTORS);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("INPUT_INVALID");
    expect(result.error.message).toBe("`local_files.max_bytes` must be a whole number of bytes from 1 to 2147483647.");
  });

  test("local_files.max_bytes stores a number", () => {
    const result = applyConfigValue(DEFAULT_CONFIG, "local_files.max_bytes", "1048576", PROVIDER_DESCRIPTORS);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(getConfigValue(result.data, "local_files.max_bytes")).toBe(1048576);
    expect(result.data.local_files).toEqual({ max_bytes: 1048576 });
  });
});
