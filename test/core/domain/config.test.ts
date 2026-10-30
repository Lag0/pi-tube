import { describe, expect, test } from "vitest";
import { parseConfig } from "../../../src/core/domain/config.ts";

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
