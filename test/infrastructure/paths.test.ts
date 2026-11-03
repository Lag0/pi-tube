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
      auditDir: path.join(FAKE_HOME, ".pi-tube", "audit"),
      legacyDirs: [path.join(FAKE_HOME, ".pi-tube")],
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

  test("keeps an absolute PI_TUBE_LIBRARY_DIR as is; PI_TUBE_OUTPUT_DIR is only read for the v2 import", () => {
    const libraryDir = path.resolve("/data/library");
    const oldDir = path.resolve("/data/old");
    const paths = resolvePiTubePaths({
      env: { PI_TUBE_LIBRARY_DIR: libraryDir, PI_TUBE_OUTPUT_DIR: oldDir },
      cwd: CWD,
      homedir: () => FAKE_HOME,
    });

    expect(paths.libraryDir).toBe(libraryDir);
    const { legacyDirs, ...writtenPaths } = paths;
    expect(Object.values(writtenPaths)).not.toContain(oldDir);
    expect(legacyDirs).toEqual([path.join(FAKE_HOME, ".pi-tube"), oldDir]);
  });

  test("the v2 import reads only ~/.pi-tube without PI_TUBE_OUTPUT_DIR, and a relative one against the cwd", () => {
    const plain = resolvePiTubePaths({ env: {}, cwd: CWD, homedir: () => FAKE_HOME });
    const relative = resolvePiTubePaths({ env: { PI_TUBE_OUTPUT_DIR: "old" }, cwd: CWD, homedir: () => FAKE_HOME });

    expect(plain.legacyDirs).toEqual([path.join(FAKE_HOME, ".pi-tube")]);
    expect(relative.legacyDirs).toEqual([path.join(FAKE_HOME, ".pi-tube"), path.join(CWD, "old")]);
  });
});
