import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getConfigValue,
  listConfigValues,
  resolveConfigPath,
  setConfigValue,
} from "../../src/config/store.ts";

describe("config store", () => {
  test("resolves explicit config path for test isolation", () => {
    const cwd = process.cwd();
    const configPath = resolveConfigPath({
      cwd,
      env: { PI_TUBE_CONFIG_PATH: ".tmp/pi-tube-test-config.json" },
    });

    expect(configPath).toBe(path.join(cwd, ".tmp/pi-tube-test-config.json"));
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
