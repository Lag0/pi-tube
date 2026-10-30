import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG, type PiTubeConfig } from "../../src/core/domain/config.ts";
import { createFileConfigStore } from "../../src/infrastructure/config/file-config-store.ts";

const isWindows = process.platform === "win32";
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

const SAMPLE: PiTubeConfig = {
  version: 1,
  defaults: { provider: "groq" },
  providers: { groq: { api_key: "gq-key" } },
};

let root: string;
let configFile: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "pi-tube-config-store-"));
  configFile = path.join(root, "nested", "config.json");
});

afterEach(() => {
  chmodSync(root, 0o700);
  rmSync(root, { recursive: true, force: true });
});

const writeRaw = (content: string): void => {
  mkdirSync(path.dirname(configFile), { recursive: true });
  writeFileSync(configFile, content);
};

describe("file config store", () => {
  test("returns the default config when the file is missing", async () => {
    expect(await createFileConfigStore(configFile).read()).toEqual({ success: true, data: DEFAULT_CONFIG });
  });

  test("returns the default config when the file is blank", async () => {
    writeRaw("  \n");

    expect(await createFileConfigStore(configFile).read()).toEqual({ success: true, data: DEFAULT_CONFIG });
  });

  test("reads and updates a config saved with a UTF-8 BOM", async () => {
    writeRaw(`﻿${JSON.stringify(SAMPLE)}`);
    const store = createFileConfigStore(configFile);

    expect(await store.read()).toEqual({ success: true, data: SAMPLE });
    expect(await store.write({ ...SAMPLE, defaults: { provider: "deepgram" } })).toEqual({
      success: true,
      data: undefined,
    });
    expect(JSON.parse(readFileSync(configFile, "utf8")).defaults.provider).toBe("deepgram");
  });

  test("round-trips a written config", async () => {
    const store = createFileConfigStore(configFile);

    expect(await store.write(SAMPLE)).toEqual({ success: true, data: undefined });
    expect(await store.read()).toEqual({ success: true, data: SAMPLE });
    expect(readFileSync(configFile, "utf8")).toBe(`${JSON.stringify(SAMPLE, null, 2)}\n`);
  });

  test.skipIf(isWindows)("writes the file as 600 inside a 700 directory", async () => {
    await createFileConfigStore(configFile).write(SAMPLE);

    expect(statSync(configFile).mode & 0o777).toBe(0o600);
    expect(statSync(path.dirname(configFile)).mode & 0o777).toBe(0o700);
  });

  test.each([
    ["truncated JSON", '{"version": 1, "providers": {'],
    ["providers as an array", '{"providers": []}'],
  ])("%s is CONFIG_INVALID and is never overwritten", async (_label, content) => {
    writeRaw(content);
    const store = createFileConfigStore(configFile);

    const read = await store.read();
    const write = await store.write(SAMPLE);

    expect(read.success ? undefined : read.error.code).toBe("CONFIG_INVALID");
    expect(write.success ? undefined : write.error.code).toBe("CONFIG_INVALID");
    expect(readFileSync(configFile, "utf8")).toBe(content);
  });

  test("preserves unknown keys on write", async () => {
    writeRaw(JSON.stringify({ version: 1, future: { x: 1 }, providers: { groq: { api_key: "old", extra: true } } }));

    await createFileConfigStore(configFile).write(SAMPLE);

    expect(JSON.parse(readFileSync(configFile, "utf8"))).toEqual({
      version: 1,
      future: { x: 1 },
      providers: { groq: { api_key: "gq-key", extra: true } },
      defaults: { provider: "groq" },
    });
  });

  test("removes fields that became undefined", async () => {
    writeRaw(JSON.stringify(SAMPLE));

    await createFileConfigStore(configFile).write({ ...SAMPLE, providers: { groq: {} } });

    expect(JSON.parse(readFileSync(configFile, "utf8")).providers).toEqual({ groq: {} });
  });

  test("a config path that is a directory is CONFIG_IO_FAILED on read and write", async () => {
    mkdirSync(configFile, { recursive: true });
    const store = createFileConfigStore(configFile);

    const read = await store.read();
    const write = await store.write(SAMPLE);

    expect(read.success ? undefined : read.error.code).toBe("CONFIG_IO_FAILED");
    expect(write.success ? undefined : write.error.code).toBe("CONFIG_IO_FAILED");
  });

  test("a stale temp file next to the config does not affect read", async () => {
    writeRaw(JSON.stringify(SAMPLE));
    writeFileSync(`${configFile}.123.abc.tmp`, "{garbage");

    expect(await createFileConfigStore(configFile).read()).toEqual({ success: true, data: SAMPLE });
  });

  test.skipIf(isWindows || isRoot)("a read-only directory is CONFIG_IO_FAILED on write", async () => {
    mkdirSync(path.dirname(configFile), { recursive: true });
    chmodSync(path.dirname(configFile), 0o500);

    const write = await createFileConfigStore(configFile).write(SAMPLE);

    chmodSync(path.dirname(configFile), 0o700);
    expect(write.success ? undefined : write.error.code).toBe("CONFIG_IO_FAILED");
  });
});
