import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_CONFIG, type PiTubeConfig } from "../../src/core/domain/config.ts";
import { createError } from "../../src/core/domain/errors.ts";
import { err, ok } from "../../src/core/domain/result.ts";
import { createFileConfigStore } from "../../src/infrastructure/config/file-config-store.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs/promises")>();
  return { ...fs, mkdir: vi.fn(fs.mkdir), rm: vi.fn(fs.rm), writeFile: vi.fn(fs.writeFile) };
});

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
    expect(existsSync(path.dirname(configFile))).toBe(false);
  });

  test("reads without a lock and fails without stealing a competing writer's lock", async () => {
    const content = JSON.stringify(SAMPLE);
    writeRaw(content);
    mkdirSync(`${configFile}.lock`);
    const store = createFileConfigStore(configFile);
    expect(await store.read()).toEqual(ok(SAMPLE));
    const result = await store.update(() => ok(DEFAULT_CONFIG));
    expect(result).toMatchObject({
      success: false,
      error: { code: "CONFIG_IO_FAILED", message: expect.stringContaining("no writer is running") },
    });
    expect(existsSync(`${configFile}.lock`)).toBe(true);
    expect(readFileSync(configFile, "utf8")).toBe(content);
  }, 15000);

  test("returns the default config when the file is blank", async () => {
    writeRaw("  \n");

    expect(await createFileConfigStore(configFile).read()).toEqual({ success: true, data: DEFAULT_CONFIG });
  });

  test("reads and updates a config saved with a UTF-8 BOM", async () => {
    writeRaw(`﻿${JSON.stringify(SAMPLE)}`);
    const store = createFileConfigStore(configFile);

    expect(await store.read()).toEqual({ success: true, data: SAMPLE });
    expect(await store.update(() => ok({ ...SAMPLE, defaults: { provider: "deepgram" } }))).toEqual({
      success: true,
      data: { ...SAMPLE, defaults: { provider: "deepgram" } },
    });
    expect(JSON.parse(readFileSync(configFile, "utf8")).defaults.provider).toBe("deepgram");
  });

  test("round-trips a written config", async () => {
    const store = createFileConfigStore(configFile);

    expect(await store.update(() => ok(SAMPLE))).toEqual({ success: true, data: SAMPLE });
    expect(await store.read()).toEqual({ success: true, data: SAMPLE });
    expect(readFileSync(configFile, "utf8")).toBe(`${JSON.stringify(SAMPLE, null, 2)}\n`);
  });

  test.skipIf(isWindows)("writes the file as 600 inside a 700 directory", async () => {
    await createFileConfigStore(configFile).update(() => ok(SAMPLE));

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
    const write = await store.update(() => ok(SAMPLE));

    expect(read.success ? undefined : read.error.code).toBe("CONFIG_INVALID");
    expect(write.success ? undefined : write.error.code).toBe("CONFIG_INVALID");
    expect(readFileSync(configFile, "utf8")).toBe(content);
  });

  test("preserves unknown keys on write", async () => {
    writeRaw(JSON.stringify({ version: 1, future: { x: 1 }, providers: { groq: { api_key: "old", extra: true } } }));

    await createFileConfigStore(configFile).update(() => ok(SAMPLE));

    expect(JSON.parse(readFileSync(configFile, "utf8"))).toEqual({
      version: 1,
      future: { x: 1 },
      providers: { groq: { api_key: "gq-key", extra: true } },
      defaults: { provider: "groq" },
    });
  });

  test("writes a source section and keeps the unknown keys inside it", async () => {
    writeRaw(JSON.stringify({ version: 1, network: { future: 1 } }));

    await createFileConfigStore(configFile).update(() => ok({ ...SAMPLE, network: { allow_private_hosts: true } }));

    expect(JSON.parse(readFileSync(configFile, "utf8")).network).toEqual({ future: 1, allow_private_hosts: true });
  });

  test("writes the audit section and reads it back", async () => {
    const store = createFileConfigStore(configFile);

    await store.update(() => ok({ ...SAMPLE, audit: { retention_months: 6 } }));

    expect(JSON.parse(readFileSync(configFile, "utf8")).audit).toEqual({ retention_months: 6 });
    const read = await store.read();
    expect(read.success ? read.data.audit : read).toEqual({ retention_months: 6 });
  });

  test("writes the mcp section only when it is set, and reads it back", async () => {
    const store = createFileConfigStore(configFile);

    await store.update(() => ok(SAMPLE));
    expect(Object.hasOwn(JSON.parse(readFileSync(configFile, "utf8")), "mcp")).toBe(false);
    await store.update(() => ok({ ...SAMPLE, mcp: { max_full_chars: 5000 } }));

    expect(JSON.parse(readFileSync(configFile, "utf8")).mcp).toEqual({ max_full_chars: 5000 });
    const read = await store.read();
    expect(read.success ? read.data.mcp : read).toEqual({ max_full_chars: 5000 });
  });

  test("does not add empty source sections to a file that lacks them", async () => {
    writeRaw(JSON.stringify(SAMPLE));

    await createFileConfigStore(configFile).update(() => ok({ ...SAMPLE, defaults: { provider: "deepgram" } }));

    const written = JSON.parse(readFileSync(configFile, "utf8"));
    expect(Object.keys(written)).toEqual(["version", "defaults", "providers"]);
  });

  test("removes fields that became undefined", async () => {
    writeRaw(JSON.stringify(SAMPLE));

    await createFileConfigStore(configFile).update(() => ok({ ...SAMPLE, providers: { groq: {} } }));

    expect(JSON.parse(readFileSync(configFile, "utf8")).providers).toEqual({ groq: {} });
  });

  test("a config path that is a directory is CONFIG_IO_FAILED on read and write", async () => {
    mkdirSync(configFile, { recursive: true });
    const store = createFileConfigStore(configFile);

    const read = await store.read();
    const write = await store.update(() => ok(SAMPLE));

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

    const write = await createFileConfigStore(configFile).update(() => ok(SAMPLE));

    chmodSync(path.dirname(configFile), 0o700);
    expect(write.success ? undefined : write.error.code).toBe("CONFIG_IO_FAILED");
  });
});

test.each(["invalid", "valid"])("lock permission failure with %s config", async (kind) => {
  const content = kind === "invalid" ? "{" : JSON.stringify(SAMPLE);
  writeRaw(content);
  vi.mocked(mkdir)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(Object.assign(new Error(), { code: "EACCES" }));
  const change = vi.fn(() => ok(DEFAULT_CONFIG));
  expect(await createFileConfigStore(configFile).update(change)).toMatchObject({
    error: { code: kind === "invalid" ? "CONFIG_INVALID" : "CONFIG_IO_FAILED" },
  });
  expect(change).not.toHaveBeenCalled();
  expect(readFileSync(configFile, "utf8")).toBe(content);
});

test("cancellation during contention preserves the other writer's lock", async () => {
  writeRaw("{}");
  mkdirSync(`${configFile}.lock`);
  const controller = new AbortController();
  vi.mocked(mkdir)
    .mockResolvedValueOnce(undefined)
    .mockImplementationOnce(async () => {
      controller.abort();
      throw Object.assign(new Error(), { code: "EEXIST" });
    });
  expect(await createFileConfigStore(configFile).update(() => ok(SAMPLE), controller.signal)).toMatchObject({
    error: { code: "CANCELLED" },
  });
  expect(existsSync(`${configFile}.lock`)).toBe(true);
  expect(readFileSync(configFile, "utf8")).toBe("{}");
});

test.each([0, 1, 2])(
  "cancellation after temporary write prevents publication: %i cleanup failures",
  async (failures) => {
    const warn = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
    for (let i = 0; i < failures; i++) vi.mocked(rm).mockRejectedValueOnce(new Error("private-cleanup-error"));
    let tempFile = "";
    writeRaw("{}");
    const controller = new AbortController();
    vi.mocked(writeFile).mockImplementationOnce(async (file, data, options) => {
      const fs = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
      tempFile = String(file);
      await fs.writeFile(file, data, options);
      controller.abort();
    });
    expect(await createFileConfigStore(configFile).update(() => ok(SAMPLE), controller.signal)).toMatchObject({
      success: false,
      error: { code: "CANCELLED" },
    });
    expect(readFileSync(configFile, "utf8")).toBe("{}");
    expect(existsSync(`${configFile}.lock`)).toBe(false);
    expect(existsSync(tempFile)).toBe(failures === 2);
    if (failures === 2) {
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(tempFile));
      expect(warn.mock.calls.flat().join(" ")).not.toMatch(/gq-key|private-cleanup-error/);
    } else expect(warn).not.toHaveBeenCalled();
  },
);

test.each([true, false])("release failure preserves mutation outcome: published=%s", async (publish) => {
  writeRaw("{}");
  const warn = vi.spyOn(process, "emitWarning").mockImplementation(() => {});
  const outcome = publish ? ok(SAMPLE) : err(createError("CONFIG_INVALID", "Invalid change."));
  expect(
    await createFileConfigStore(configFile).update(() => {
      writeFileSync(path.join(`${configFile}.lock`, "marker"), "");
      return outcome;
    }),
  ).toEqual(outcome);
  expect(JSON.parse(readFileSync(configFile, "utf8"))).toEqual(publish ? SAMPLE : {});
  expect(warn).toHaveBeenCalledWith(expect.stringContaining(`${configFile}.lock`));
  expect(warn.mock.calls.flat().join(" ")).not.toMatch(/gq-key|retry/i);
});
