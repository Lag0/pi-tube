import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createFileTranscriptStore } from "../../../src/infrastructure/output/file-transcript-store.ts";

let outputDir: string;

beforeEach(() => {
  outputDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-transcript-store-"));
});

afterEach(() => {
  rmSync(outputDir, { recursive: true, force: true });
});

describe("file transcript store", () => {
  test("never overwrites: a second save of the same name gets -2", async () => {
    const store = createFileTranscriptStore(outputDir);

    const first = await store.save({ fileName: "2026-10-30-demo.md", content: "one" });
    const second = await store.save({ fileName: "2026-10-30-demo.md", content: "two" });

    expect(first.success ? path.basename(first.data.path) : undefined).toBe("2026-10-30-demo.md");
    expect(second.success ? path.basename(second.data.path) : undefined).toBe("2026-10-30-demo-2.md");
    expect(readFileSync(path.join(outputDir, "2026-10-30-demo.md"), "utf8")).toBe("one");
  });
});
