import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createImportV2Transcripts } from "../../../src/core/application/import-v2.ts";
import { createFileLibraryStore } from "../../../src/infrastructure/library/file-library-store.ts";
import { createV2Transcripts } from "../../../src/infrastructure/library/v2-transcripts.ts";

const isWindows = process.platform === "win32";
const FIXTURES = path.join("test", "fixtures", "v2");

let root: string;
let home: string;
let outputDir: string;
let libraryDir: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "pi-tube-v2-reader-"));
  home = path.join(root, ".pi-tube");
  outputDir = path.join(root, "transcripts");
  libraryDir = path.join(root, "library");
  mkdirSync(home, { recursive: true });
  mkdirSync(outputDir, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const put = (dir: string, name: string, fixtureName: string): void => {
  mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
  writeFileSync(path.join(dir, name), readFileSync(path.join(FIXTURES, fixtureName)));
};

/** Every entry under `dir`, with its size and mtime. */
const snapshot = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, encoding: "utf8" })
    .sort()
    .map((name) => {
      const info = statSync(path.join(dir, name));
      return `${name} ${info.size} ${info.mtimeMs}`;
    });

describe("v2 transcripts reader", () => {
  test("lists only v2-named files at the top of each dir", async () => {
    put(home, "2026-03-02-demo.json", "json-golden.json");
    put(home, "config.json", "json-golden.json");
    put(home, "notes.md", "markdown-golden.md");
    put(home, path.join("library", "2026-03-02-x.md"), "markdown-golden.md");
    put(home, path.join("audit", "2026-03-02-y.md"), "markdown-golden.md");
    put(home, path.join("old", "2026-03-02-nested.md"), "markdown-golden.md");
    put(outputDir, "2026-04-10-aula-1.md", "groq-timestamps.md");

    const files = await createV2Transcripts({ dirs: [home, outputDir, home], libraryDir }).files();

    expect(files.success ? files.data.map((file) => file.path) : files).toEqual([
      path.join(home, "2026-03-02-demo.json"),
      path.join(outputDir, "2026-04-10-aula-1.md"),
    ]);
    const golden = readFileSync(path.join(FIXTURES, "json-golden.json"));
    expect(files.success ? files.data[0] : undefined).toMatchObject({
      name: "2026-03-02-demo.json",
      text: golden.toString("utf8"),
      sha256: createHash("sha256").update(golden).digest("hex"),
    });
  });

  test("a missing dir lists nothing", async () => {
    const files = await createV2Transcripts({ dirs: [path.join(root, "absent")], libraryDir }).files();

    expect(files).toEqual({ success: true, data: [] });
  });

  test("an import leaves the v2 dirs exactly as they were", async () => {
    put(home, "2026-03-02-demo.json", "json-golden.json");
    put(home, "2026-03-02-demo.md", "markdown-golden.md");
    put(home, "config.json", "json-golden.json");
    put(outputDir, "2026-04-10-aula-1.md", "groq-timestamps.md");
    const before = [snapshot(home), snapshot(outputDir)];
    const legacy = createV2Transcripts({ dirs: [home, outputDir], libraryDir });

    const result = await createImportV2Transcripts({ legacy, library: createFileLibraryStore({ libraryDir }) })({});

    expect(result.success ? result.data.imported : result).toBe(2);
    expect([snapshot(home), snapshot(outputDir)]).toEqual(before);
  });

  test("markImported writes .v2-import.json, and isImported reads it back", async () => {
    const legacy = createV2Transcripts({ dirs: [home], libraryDir, now: () => new Date("2026-11-02T10:00:00.000Z") });
    const summary = { ranBefore: false, found: 2, imported: 1, already: 0, skipped: [{ file: "/x.md", reason: "r" }] };

    expect(await legacy.isImported()).toBe(false);
    expect(await legacy.markImported(summary)).toEqual({ success: true, data: undefined });

    expect(await legacy.isImported()).toBe(true);
    const marker = path.join(libraryDir, ".v2-import.json");
    expect(JSON.parse(readFileSync(marker, "utf8"))).toEqual({
      schema_version: 1,
      imported_at: "2026-11-02T10:00:00.000Z",
      found: 2,
      imported: 1,
      already: 0,
      skipped: [{ file: "/x.md", reason: "r" }],
    });
    if (!isWindows) expect(statSync(marker).mode & 0o777).toBe(0o600);
  });

  test("a corrupt marker reads as not imported", async () => {
    mkdirSync(libraryDir, { recursive: true });
    writeFileSync(path.join(libraryDir, ".v2-import.json"), "{");

    expect(await createV2Transcripts({ dirs: [home], libraryDir }).isImported()).toBe(false);
  });
});
