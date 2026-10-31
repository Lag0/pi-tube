import { describe, expect, test } from "vitest";
import type { PiTubeConfig } from "../../../src/core/domain/config.ts";
import { isAbsolutePath, resolveSourceSettings } from "../../../src/core/domain/source-settings.ts";

const config = (overrides: Partial<PiTubeConfig> = {}): PiTubeConfig => ({
  version: 1,
  defaults: {},
  providers: {},
  ...overrides,
});

describe("resolveSourceSettings", () => {
  test("defaults: private hosts refused, 1 GiB local files, no cookies", () => {
    expect(resolveSourceSettings(config(), {})).toEqual({
      success: true,
      data: { allowPrivateHosts: false, maxLocalFileBytes: 1073741824 },
    });
  });

  test("reads the config values", () => {
    const result = resolveSourceSettings(
      config({
        network: { allow_private_hosts: true },
        local_files: { max_bytes: 10 },
        cookies: { file: "/b/c.txt" },
      }),
      {},
    );

    expect(result).toEqual({
      success: true,
      data: { allowPrivateHosts: true, maxLocalFileBytes: 10, cookies: { file: "/b/c.txt", origin: "config" } },
    });
  });

  test("PI_TUBE_COOKIES_FILE wins over cookies.file", () => {
    const result = resolveSourceSettings(config({ cookies: { file: "/b/c.txt" } }), {
      PI_TUBE_COOKIES_FILE: "/a/c.txt",
    });

    expect(result.success ? result.data.cookies : undefined).toEqual({ file: "/a/c.txt", origin: "env" });
  });

  test.each(["", "   "])("an empty PI_TUBE_COOKIES_FILE (%j) falls back to the config", (value) => {
    const result = resolveSourceSettings(config({ cookies: { file: "/b/c.txt" } }), { PI_TUBE_COOKIES_FILE: value });

    expect(result.success ? result.data.cookies : undefined).toEqual({ file: "/b/c.txt", origin: "config" });
  });

  test("a relative PI_TUBE_COOKIES_FILE is COOKIES_FILE_INVALID", () => {
    const result = resolveSourceSettings(config(), { PI_TUBE_COOKIES_FILE: "cookies.txt" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("COOKIES_FILE_INVALID");
    expect(result.error.message).toBe("`PI_TUBE_COOKIES_FILE` must be an absolute path.");
  });

  test("a relative cookies.file edited by hand is COOKIES_FILE_INVALID", () => {
    const result = resolveSourceSettings(config({ cookies: { file: "cookies.txt" } }), {});

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("COOKIES_FILE_INVALID");
    expect(result.error.message).toBe("`cookies.file` must be an absolute path.");
  });
});

describe("isAbsolutePath", () => {
  test.each([
    ["/Users/me/c.txt", true],
    ["C:\\Users\\me\\c.txt", true],
    ["c:/Users/me/c.txt", true],
    ["\\\\server\\share\\c.txt", true],
    ["c.txt", false],
    ["./c.txt", false],
    ["C:c.txt", false],
    ["~/c.txt", false],
  ])("%s → %s", (value, expected) => {
    expect(isAbsolutePath(value)).toBe(expected);
  });
});
