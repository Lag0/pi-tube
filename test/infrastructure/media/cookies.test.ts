import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { SourceSettings } from "../../../src/core/domain/source-settings.ts";
import { prepareCookies } from "../../../src/infrastructure/media/cookies.ts";

const isWindows = process.platform === "win32";
const HEADER = "# Netscape HTTP Cookie File";

let root: string;
let tmpDir: string;
let userFile: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "pi-tube-cookies-"));
  tmpDir = path.join(root, "tmp");
  userFile = path.join(root, "my-cookies.txt");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const settingsWith = (origin: "env" | "config" = "config"): SourceSettings => ({
  allowPrivateHosts: false,
  maxLocalFileBytes: 1_073_741_824,
  cookies: { file: userFile, origin },
});

describe("prepareCookies", () => {
  test("without cookies there are no args and nothing to clean", async () => {
    const prepared = await prepareCookies({ allowPrivateHosts: false, maxLocalFileBytes: 1 }, tmpDir);

    expect(prepared.success ? prepared.data.args : undefined).toEqual([]);
    expect(existsSync(tmpDir)).toBe(false);
  });

  test("copies the file into a private temp dir and cleanup removes it", async () => {
    const content = `${HEADER}\n.example.com\tTRUE\t/\tTRUE\t0\tsid\tabc\n`;
    writeFileSync(userFile, content);

    const prepared = await prepareCookies(settingsWith(), tmpDir);

    expect(prepared.success).toBe(true);
    if (!prepared.success) return;
    const [flag, copy = ""] = prepared.data.args;
    expect(flag).toBe("--cookies");
    expect(copy).not.toBe(userFile);
    expect(path.basename(path.dirname(copy)).startsWith("cookies-")).toBe(true);
    expect(readFileSync(copy, "utf8")).toBe(content);
    if (!isWindows) {
      expect(statSync(copy).mode & 0o777).toBe(0o600);
      expect(statSync(path.dirname(copy)).mode & 0o777).toBe(0o700);
    }
    await prepared.data.cleanup();
    expect(existsSync(path.dirname(copy))).toBe(false);
  });

  test("a missing file is COOKIES_FILE_INVALID without the path", async () => {
    const prepared = await prepareCookies(settingsWith("env"), tmpDir);

    expect(prepared.success ? undefined : prepared.error.code).toBe("COOKIES_FILE_INVALID");
    expect(prepared.success ? undefined : prepared.error.message).toBe(
      "The cookies file set by `PI_TUBE_COOKIES_FILE` cannot be read (ENOENT).",
    );
    expect(JSON.stringify(prepared)).not.toContain(userFile);
  });

  test.each([
    ["empty", ""],
    ["JSON", '[{"name":"a"}]'],
    ["headerless", ".example.com\tTRUE\t/\tTRUE\t0\tsid\tabc\n"],
  ])("a %s file is COOKIES_FILE_INVALID with the format message", async (_name, content) => {
    writeFileSync(userFile, content);

    const prepared = await prepareCookies(settingsWith(), tmpDir);

    expect(prepared.success ? undefined : prepared.error.message).toBe(
      "The cookies file set by `cookies.file` is not in Netscape format: its first line must be `# Netscape HTTP Cookie File`.",
    );
  });

  test("an entry without 7 tab-separated fields is refused by line number, without its content", async () => {
    writeFileSync(userFile, `${HEADER}\n# a comment\n\n.youtube.com TRUE / TRUE 0 SID super-secret\n`);

    const prepared = await prepareCookies(settingsWith(), tmpDir);

    expect(prepared.success ? undefined : prepared.error).toMatchObject({
      code: "COOKIES_FILE_INVALID",
      message:
        "The cookies file set by `cookies.file` has a malformed entry on line 4: each cookie needs 7 tab-separated fields.",
    });
    expect(JSON.stringify(prepared)).not.toContain("super-secret");
    expect(existsSync(tmpDir)).toBe(false);
  });

  test("#HttpOnly_ lines are entries, and CRLF line ends are fine", async () => {
    writeFileSync(userFile, `${HEADER}\r\n#HttpOnly_.example.com\tTRUE\t/\tTRUE\t0\tsid\tabc\r\n`);

    const prepared = await prepareCookies(settingsWith(), tmpDir);

    expect(prepared.success).toBe(true);
    if (prepared.success) await prepared.data.cleanup();
  });

  test("a malformed #HttpOnly_ entry is refused", async () => {
    writeFileSync(userFile, `${HEADER}\n#HttpOnly_.example.com TRUE / TRUE 0 sid abc\n`);

    const prepared = await prepareCookies(settingsWith(), tmpDir);

    expect(prepared.success ? undefined : prepared.error.message).toContain("line 2");
  });

  test("a UTF-8 BOM is dropped from the copy", async () => {
    writeFileSync(userFile, `﻿${HEADER}\n`);

    const prepared = await prepareCookies(settingsWith(), tmpDir);

    expect(prepared.success).toBe(true);
    if (!prepared.success) return;
    expect(readFileSync(prepared.data.args[1] ?? "", "utf8").startsWith("#")).toBe(true);
    await prepared.data.cleanup();
  });

  test("the short header `# HTTP Cookie File` is accepted", async () => {
    writeFileSync(userFile, "# HTTP Cookie File\n");

    const prepared = await prepareCookies(settingsWith(), tmpDir);

    expect(prepared.success).toBe(true);
    if (prepared.success) await prepared.data.cleanup();
  });
});
