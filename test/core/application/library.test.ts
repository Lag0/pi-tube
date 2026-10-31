import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  createGetTranscript,
  createListTranscripts,
  createSearchTranscripts,
} from "../../../src/core/application/library.ts";
import { matchesName } from "../../../src/core/domain/library.ts";
import type { LibraryEntry } from "../../../src/core/ports/library-store.ts";
import { createFileLibraryStore } from "../../../src/infrastructure/library/file-library-store.ts";

let libraryDir: string;

beforeEach(() => {
  libraryDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-library-cases-"));
});

afterEach(() => {
  rmSync(libraryDir, { recursive: true, force: true });
});

const entry = (overrides: Partial<LibraryEntry>): LibraryEntry => ({
  transcriptId: "0123456789abcdef0123",
  sourceKey: "youtube:abc",
  kind: "youtube",
  provider: "groq",
  generatedAt: "2026-10-31T00:00:00.000Z",
  characters: 1,
  ...overrides,
});

describe("matchesName", () => {
  test.each([
    ["acao", true],
    ["AULA penal", true],
    ["Ação", true],
    ["aula civil", false],
  ])("%s against 'Aula de Ação Penal' is %s", (query, expected) => {
    expect(matchesName(entry({ title: "Aula de Ação Penal" }), query)).toBe(expected);
  });

  test("matches the file name, the platform and the source key", () => {
    expect(matchesName(entry({ kind: "local_file", sourceName: "entrevista.mp3" }), "entrevista")).toBe(true);
    expect(matchesName(entry({ platform: "Youtube" }), "youtube")).toBe(true);
    expect(matchesName(entry({ sourceKey: "vimeo:76979871" }), "76979871")).toBe(true);
  });
});

describe("library use cases", () => {
  const library = () => createFileLibraryStore({ libraryDir });

  test.each([0, 501])("a limit of %i is INPUT_INVALID", async (limit) => {
    const result = await createListTranscripts({ library: library() })({ limit, offset: 0 });

    expect(result.success ? undefined : result.error.code).toBe("INPUT_INVALID");
  });

  test("a negative offset is INPUT_INVALID", async () => {
    const result = await createListTranscripts({ library: library() })({ limit: 20, offset: -1 });

    expect(result.success ? undefined : result.error.code).toBe("INPUT_INVALID");
  });

  test("an unknown transcript id is TRANSCRIPT_NOT_FOUND", async () => {
    const result = await createGetTranscript({ library: library() })({ transcriptId: "ffffffffffffffffffff" });

    expect(result.success ? undefined : result.error).toMatchObject({
      code: "TRANSCRIPT_NOT_FOUND",
      hint: "Run `pi-tube library list` to see the transcripts in the library.",
    });
  });

  test.each(["", "   "])("an empty query (%j) is INPUT_INVALID", async (query) => {
    const result = await createSearchTranscripts({ library: library() })({ query, limit: 20, offset: 0 });

    expect(result.success ? undefined : result.error.code).toBe("INPUT_INVALID");
  });
});
