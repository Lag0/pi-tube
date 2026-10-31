import path from "node:path";
import { describe, expect, test } from "vitest";
import { resolvePiTubePaths } from "../../src/infrastructure/paths.ts";

const CWD = path.resolve("/work/project");
const FAKE_HOME = path.resolve("/fake-home");

describe("resolvePiTubePaths", () => {
  test("falls back to homedir() when HOME is absent, never to the cwd", () => {
    const paths = resolvePiTubePaths({ env: {}, cwd: CWD, homedir: () => FAKE_HOME });

    expect(paths).toEqual({
      home: path.join(FAKE_HOME, ".pi-tube"),
      configFile: path.join(FAKE_HOME, ".pi-tube", "config.json"),
      libraryDir: path.join(FAKE_HOME, ".pi-tube", "library"),
      tmpDir: path.join(FAKE_HOME, ".pi-tube", "tmp"),
      downloadsDir: path.join(FAKE_HOME, ".pi-tube", "downloads"),
    });
  });

  test("resolves a relative PI_TUBE_LIBRARY_DIR against the cwd", () => {
    const paths = resolvePiTubePaths({ env: { PI_TUBE_LIBRARY_DIR: "lib" }, cwd: CWD, homedir: () => FAKE_HOME });

    expect(paths.libraryDir).toBe(path.join(CWD, "lib"));
  });

  test("prefers HOME over homedir()", () => {
    const paths = resolvePiTubePaths({ env: { HOME: "/env-home" }, cwd: CWD, homedir: () => FAKE_HOME });

    expect(paths.home).toBe(path.join("/env-home", ".pi-tube"));
  });

  test("resolves a relative PI_TUBE_CONFIG_PATH against the cwd", () => {
    const paths = resolvePiTubePaths({
      env: { PI_TUBE_CONFIG_PATH: "conf/pi.json" },
      cwd: CWD,
      homedir: () => FAKE_HOME,
    });

    expect(paths.configFile).toBe(path.join(CWD, "conf", "pi.json"));
  });

  test("keeps an absolute PI_TUBE_LIBRARY_DIR as is and ignores the removed PI_TUBE_OUTPUT_DIR", () => {
    const libraryDir = path.resolve("/data/library");
    const paths = resolvePiTubePaths({
      env: { PI_TUBE_LIBRARY_DIR: libraryDir, PI_TUBE_OUTPUT_DIR: "/data/old" },
      cwd: CWD,
      homedir: () => FAKE_HOME,
    });

    expect(paths.libraryDir).toBe(libraryDir);
    expect(Object.values(paths)).not.toContain("/data/old");
  });
});
