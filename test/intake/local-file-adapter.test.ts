import { describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveLocalFileSource } from "../../src/intake/adapters/local-file.ts";

describe("local file adapter", () => {
  test("normalizes and validates supported local media files", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-local-"));
    const filePath = path.join(tempDir, "sample.wav");

    try {
      writeFileSync(filePath, "audio-data");
      const source = await resolveLocalFileSource(filePath);

      expect(source.kind).toBe("local_file");
      expect(source.absolutePath).toBe(filePath);
      expect(source.extension).toBe("wav");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("returns deterministic not-found error when file is missing", async () => {
    const missingPath = path.join(os.tmpdir(), "pi-tube-missing-file.mp3");

    await expect(resolveLocalFileSource(missingPath)).rejects.toMatchObject({
      code: "LOCAL_FILE_NOT_FOUND",
    });
  });

  test("returns deterministic unsupported-extension error", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-local-"));
    const filePath = path.join(tempDir, "sample.txt");

    try {
      writeFileSync(filePath, "not-media");
      await expect(resolveLocalFileSource(filePath)).rejects.toMatchObject({
        code: "LOCAL_FILE_UNSUPPORTED_EXTENSION",
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
