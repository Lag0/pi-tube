import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { ok } from "../../../src/core/domain/result.ts";
import { audioReadError, runProviderCall } from "../../../src/infrastructure/stt/deadline.ts";

const AUDIO = "/tmp/a.m4a";

/** A filesystem error as `fs` throws it: an `Error` with a string `code`. */
const fsError = (code: string): Error => Object.assign(new Error(code), { code });

describe("audioReadError", () => {
  test("a missing file is LOCAL_FILE_NOT_FOUND", () => {
    expect(audioReadError(AUDIO, fsError("ENOENT"))).toEqual({
      code: "LOCAL_FILE_NOT_FOUND",
      message: "Cannot read audio file `/tmp/a.m4a`.",
      hint: "Check the file path and retry.",
    });
  });

  test("a file over the readFile limit is LOCAL_FILE_TOO_LARGE", () => {
    expect(audioReadError(AUDIO, fsError("ERR_FS_FILE_TOO_LARGE"))).toEqual({
      code: "LOCAL_FILE_TOO_LARGE",
      message: "Audio file `/tmp/a.m4a` is larger than 2 GiB, the most pi-tube can read in one request.",
      hint: "Use a shorter recording.",
    });
  });

  test("any other read failure is STORAGE_IO_FAILED with its errno", () => {
    expect(audioReadError(AUDIO, fsError("EACCES"))).toEqual({
      code: "STORAGE_IO_FAILED",
      message: "Cannot read audio file `/tmp/a.m4a` (EACCES).",
      hint: "Check that your user can read the file.",
    });
  });
});

describe("runProviderCall", () => {
  test("a missing audio file is LOCAL_FILE_NOT_FOUND and the SDK is never called", async () => {
    let called = false;
    const missing = path.join(os.tmpdir(), "pi-tube-missing-audio", "nope.m4a");

    const result = await runProviderCall({
      provider: "groq",
      request: { audio: { kind: "file", path: missing }, apiKey: "k" },
      timeoutMs: 1000,
      call: async () => {
        called = true;
        return {};
      },
      interpret: () => ok({ transcript: "x" }),
    });

    expect(result.success ? undefined : result.error.code).toBe("LOCAL_FILE_NOT_FOUND");
    expect(called).toBe(false);
  });
});
