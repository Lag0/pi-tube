import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runCliInProcess } from "../helpers/cli-harness.ts";
import { createFakeMediaFetcher } from "../helpers/fake-media.ts";
import { fakeProviders, PROVIDER_KEYS } from "../helpers/transcribe-fakes.ts";

const FIXTURES = path.join("test", "fixtures", "v2");
const IMPORT_LINE = "[LIBRARY_IMPORT] found=5 imported=4 already=1 skipped=0 (pi-tube v2 transcripts; originals kept)";

let home: string;

beforeEach(() => {
  home = mkdtempSync(path.join(os.tmpdir(), "pi-tube-import-cli-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const seedV2 = (dir: string, files: Readonly<Record<string, string>>): void => {
  mkdirSync(dir, { recursive: true });
  for (const [name, fixture] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), readFileSync(path.join(FIXTURES, fixture)));
  }
};

const ALL = {
  "2026-03-02-demo.json": "json-golden.json",
  "2026-03-02-demo.md": "markdown-golden.md",
  "2026-03-05-me-at-the-zoo.md": "youtube-default.md",
  "2026-04-10-aula-1.md": "groq-timestamps.md",
  "2026-03-06-me-at-the-zoo.json": "youtube-watch.json",
};

const cli = (args: string[], env: Record<string, string> = {}) =>
  runCliInProcess(args, { env: { HOME: home, ...env } });

describe("v2 import", () => {
  test("the first library command imports the v2 transcripts once, and says so on stderr", async () => {
    seedV2(path.join(home, ".pi-tube"), ALL);

    const first = await cli(["library", "list"]);
    const second = await cli(["library", "list"]);

    expect(first.exitCode).toBe(0);
    expect(first.stderr).toContain(IMPORT_LINE);
    expect(first.stdout).toContain("[LIBRARY] total=4");
    expect(first.stdout).toContain("Me at the zoo");
    expect(second.stderr).not.toContain("[LIBRARY_IMPORT]");
  });

  test("library import runs again and finds everything already there", async () => {
    seedV2(path.join(home, ".pi-tube"), ALL);
    await cli(["library", "list"]);

    const result = await cli(["library", "import", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ found: 5, imported: 0, already: 5, skipped: [] });
  });

  test("library import lists the skipped files with their reasons", async () => {
    seedV2(path.join(home, ".pi-tube"), { "2026-03-02-demo.json": "json-golden.json" });
    writeFileSync(path.join(home, ".pi-tube", "2026-01-01-broken.md"), "notes\n");

    const result = await cli(["library", "import"]);

    expect(result.stdout.trimEnd().split("\n")).toEqual([
      "[LIBRARY_IMPORT] found=2 imported=1 already=0 skipped=1 (pi-tube v2 transcripts; originals kept)",
      `skipped: ${path.join(home, ".pi-tube", "2026-01-01-broken.md")}: Not a pi-tube v2 transcript: no frontmatter.`,
    ]);
  });

  test("transcribe --json keeps stdout pure JSON while the import line goes to stderr", async () => {
    seedV2(path.join(home, ".pi-tube"), ALL);

    const result = await runCliInProcess(["transcribe", "https://cdn.example.com/new.mp3", "--json"], {
      env: { HOME: home, ...PROVIDER_KEYS },
      fakes: { media: createFakeMediaFetcher().fetcher, stt: fakeProviders() },
    });

    expect(result.exitCode).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    expect(result.stderr).toContain(IMPORT_LINE);
  });

  test("with PI_TUBE_OUTPUT_DIR, files from that dir are imported too", async () => {
    const outputDir = path.join(home, "my-transcripts");
    seedV2(outputDir, { "2026-04-10-aula-1.md": "groq-timestamps.md" });

    const result = await cli(["library", "import", "--json"], { PI_TUBE_OUTPUT_DIR: outputDir });

    expect(JSON.parse(result.stdout)).toEqual({ found: 1, imported: 1, already: 0, skipped: [] });
  });

  test("without v2 files, no import line is printed", async () => {
    const result = await cli(["library", "list"]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain("[LIBRARY_IMPORT]");
  });
});
