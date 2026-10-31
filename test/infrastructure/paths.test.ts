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
      outputDir: path.join(FAKE_HOME, ".pi-tube"),
      tmpDir: path.join(FAKE_HOME, ".pi-tube", "tmp"),
      downloadsDir: path.join(FAKE_HOME, ".pi-tube", "downloads"),
    });
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

  test("keeps an absolute PI_TUBE_OUTPUT_DIR as is", () => {
    const outputDir = path.resolve("/data/transcripts");
    const paths = resolvePiTubePaths({ env: { PI_TUBE_OUTPUT_DIR: outputDir }, cwd: CWD, homedir: () => FAKE_HOME });

    expect(paths.outputDir).toBe(outputDir);
  });
});
