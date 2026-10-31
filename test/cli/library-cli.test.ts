import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ResolvedSource } from "../../src/core/domain/source.ts";
import { buildOutputArtifact } from "../../src/core/domain/transcript/build-artifact.ts";
import { createFileLibraryStore } from "../../src/infrastructure/library/file-library-store.ts";
import { runCliInProcess } from "../helpers/cli-harness.ts";

let libraryDir: string;

beforeEach(() => {
  libraryDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-library-cli-"));
});

afterEach(() => {
  rmSync(libraryDir, { recursive: true, force: true });
});

const page = (id: string, title: string): ResolvedSource => ({
  kind: "youtube",
  originalInput: `https://www.youtube.com/watch?v=${id}`,
  normalizedUrl: `https://www.youtube.com/watch?v=${id}`,
  metadata: { platform: "Youtube", mediaId: id, title },
});

/** Saves one transcript per source, each a minute newer than the one before. */
const seed = async (sources: readonly ResolvedSource[]) => {
  const store = createFileLibraryStore({ libraryDir });
  const ids: string[] = [];
  for (const [index, source] of sources.entries()) {
    const sourceKey = await store.sourceKeyOf(source);
    if (!sourceKey.success) throw new Error("no key");
    const artifact = buildOutputArtifact(
      { source, provider: "groq", model: "whisper-large-v3", transcript: `text ${index}`, detectedLanguage: "pt" },
      { generatedAt: new Date(Date.UTC(2026, 9, 31, 0, index)).toISOString(), includeTimestamps: true },
    );
    const saved = await store.save({
      key: { sourceKey: sourceKey.data, provider: "groq", model: "whisper-large-v3" },
      source,
      artifact,
    });
    if (!saved.success) throw new Error("save failed");
    ids.push(saved.data.transcriptId);
  }
  return ids;
};

const library = (args: string[]) => runCliInProcess(["library", ...args], { env: { PI_TUBE_LIBRARY_DIR: libraryDir } });

describe("library list", () => {
  test("--json lists the newest first, with paging", async () => {
    const [older, newer] = await seed([
      page("aaaaaaaaaaa", "Aula de Ação Penal"),
      page("bbbbbbbbbbb", "Reunião semanal"),
    ]);

    const all = JSON.parse((await library(["list", "--json"])).stdout);
    const first = JSON.parse((await library(["list", "--limit", "1", "--json"])).stdout);

    expect(all).toMatchObject({ total: 2, offset: 0, limit: 20, next_offset: null });
    expect(all.entries.map((entry: { transcript_id: string }) => entry.transcript_id)).toEqual([newer, older]);
    expect(all.entries[0]).toMatchObject({
      source_key: "youtube:bbbbbbbbbbb",
      kind: "youtube",
      title: "Reunião semanal",
      provider: "groq",
      model: "whisper-large-v3",
      requested_language: null,
      detected_language: "pt",
      characters: 6,
    });
    expect(first).toMatchObject({ total: 2, limit: 1, next_offset: 1 });
  });

  test("prints one line per transcript", async () => {
    const [id] = await seed([page("aaaaaaaaaaa", "Aula de Ação Penal")]);

    const result = await library(["list"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      `[LIBRARY] total=1 offset=0 limit=20\n${id} 2026-10-31T00:00:00.000Z groq youtube Aula de Ação Penal\n`,
    );
  });

  test("an empty library prints only the header", async () => {
    const result = await library(["list"]);

    expect(result.stdout).toBe("[LIBRARY] total=0 offset=0 limit=20\n");
  });
});

describe("library show", () => {
  test("--json prints the paths and the canonical transcript", async () => {
    const [id] = await seed([page("aaaaaaaaaaa", "Aula de Ação Penal")]);

    const payload = JSON.parse((await library(["show", id ?? "", "--json"])).stdout);

    expect(payload.transcript_id).toBe(id);
    expect(payload.markdown_path).toMatch(new RegExp(`${id}\\.md$`));
    expect(payload.json_path).toMatch(new RegExp(`${id}\\.json$`));
    expect(payload.transcript.transcript.full_text).toBe("text 0");
  });

  test("prints the transcript's facts and paths", async () => {
    const [id] = await seed([page("aaaaaaaaaaa", "Aula de Ação Penal")]);

    const result = await library(["show", id ?? ""]);

    expect(result.stdout).toContain(`[TRANSCRIPT] ${id}\n`);
    expect(result.stdout).toContain("title: Aula de Ação Penal\n");
    expect(result.stdout).toContain("provider: groq\n");
    expect(result.stdout).toContain("model: whisper-large-v3\n");
    expect(result.stdout).toContain("language: pt\n");
    expect(result.stdout).toMatch(/markdown_path: .+\.md\n/);
  });

  test("an unknown id exits 5 with TRANSCRIPT_NOT_FOUND", async () => {
    const result = await library(["show", "ffffffffffffffffffff"]);

    expect(result.exitCode).toBe(5);
    expect(result.stderr).toContain("[TRANSCRIPT_NOT_FOUND]");
  });
});

describe("library search", () => {
  const seedForSearch = () => {
    // The local file must exist: its source key is a hash of its content.
    writeFileSync(path.join(libraryDir, "entrevista.mp3"), "audio");
    return seed([
      page("aaaaaaaaaaa", "Aula de Ação Penal"),
      page("bbbbbbbbbbb", "Reunião semanal"),
      {
        kind: "local_file",
        originalInput: "entrevista.mp3",
        absolutePath: path.join(libraryDir, "entrevista.mp3"),
        extension: "mp3",
        sizeBytes: 5,
      },
    ]);
  };

  test.each([
    [["acao"], 1],
    [["AULA", "penal"], 1],
    [["entrevista"], 1],
    [["youtube"], 2],
    [["inexistente"], 0],
  ])("search %j finds %i", async (terms, total) => {
    await seedForSearch();

    const payload = JSON.parse((await library(["search", ...terms, "--json"])).stdout);

    expect(payload).toMatchObject({ query: terms.join(" "), total });
  });

  test("prints the matches under a search header", async () => {
    const [id] = await seedForSearch();

    const result = await library(["search", "acao"]);

    expect(result.stdout).toBe(
      `[LIBRARY_SEARCH] query=acao total=1 offset=0 limit=20\n${id} 2026-10-31T00:00:00.000Z groq youtube Aula de Ação Penal\n`,
    );
  });

  test("an empty query is INPUT_INVALID", async () => {
    const result = await library(["search", ""]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("[INPUT_INVALID]");
  });
});

describe("library command", () => {
  test("without an action it is INPUT_INVALID with the library usage", async () => {
    const result = await library([]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("pi-tube library list");
  });

  test("help library shows the commands", async () => {
    const result = await runCliInProcess(["help", "library", "--no-color"]);

    for (const usage of ["library list", "library show <transcript_id>", "library search <query>"]) {
      expect(result.stdout).toContain(usage);
    }
  });
});
