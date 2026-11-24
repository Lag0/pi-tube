import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApp } from "../../src/bootstrap.ts";
import { DEFAULT_CONFIG } from "../../src/core/domain/config.ts";
import type { ResolvedSource } from "../../src/core/domain/source.ts";
import { buildOutputArtifact } from "../../src/core/domain/transcript/build-artifact.ts";
import { createFileLibraryStore, sourceDirName } from "../../src/infrastructure/library/file-library-store.ts";
import { runCliInProcess } from "../helpers/cli-harness.ts";
import { SPAWN_ROOT, spawnCli } from "../helpers/spawn-cli.ts";
import { fakeProviders, PROVIDER_KEYS } from "../helpers/transcribe-fakes.ts";

let libraryDir: string;

beforeEach(() => {
  libraryDir = realpathSync(mkdtempSync(path.join(os.tmpdir(), "pi-tube-library-cli-")));
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

/** Saves one transcript per source, each a minute newer than the one before; `providers[i]` defaults to groq. */
const seed = async (sources: readonly ResolvedSource[], providers: readonly ("groq" | "deepgram")[] = []) => {
  const store = createFileLibraryStore({ libraryDir });
  const ids: string[] = [];
  for (const [index, source] of sources.entries()) {
    const sourceKey = await store.sourceKeyOf(source);
    if (!sourceKey.success) throw new Error("no key");
    const provider = providers[index] ?? "groq";
    const artifact = buildOutputArtifact(
      { source, provider, model: "whisper-large-v3", transcript: `text ${index}`, detectedLanguage: "pt" },
      { generatedAt: new Date(Date.UTC(2026, 9, 31, 0, index)).toISOString(), includeTimestamps: true },
    );
    const saved = await store.save({
      key: { sourceKey: sourceKey.data, provider, model: "whisper-large-v3" },
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
  test("pages valid matches past a corrupt neighbor and searches metadata only", async () => {
    const [, middle] = await seed([
      page("aaaaaaaaaaa", "Group oldest"),
      page("bbbbbbbbbbb", "Group middle"),
      page("ccccccccccc", "Group newest"),
    ]);
    writeFileSync(path.join(libraryDir, sourceDirName("youtube:aaaaaaaaaaa"), "corrupt.json"), "{");
    for (const command of [["list"], ["search", "Group"]]) {
      const result = await library([...command, "--offset", "1", "--limit", "1", "--json"]);
      expect(JSON.parse(result.stdout)).toMatchObject({
        total: 3,
        offset: 1,
        limit: 1,
        next_offset: 2,
        entries: [{ transcript_id: middle }],
      });
    }
    expect(JSON.parse((await library(["search", "text", "--json"])).stdout)).toMatchObject({ total: 0, entries: [] });
  });

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
    expect(payload.markdown_path).toMatch(new RegExp(`2026-10-31-aula-de-acao-penal-${id?.slice(0, 8)}\\.md$`));
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

describe("library prune", () => {
  test("old personal files do not become a source to prune", async () => {
    const dir = path.join(libraryDir, "my-interviews");
    mkdirSync(dir);
    const note = path.join(dir, "notes.md");
    writeFileSync(note, "keep me");
    utimesSync(note, new Date(0), new Date(0));
    const args = ["prune", "--include-transcripts", "--older-than", "30", "--json"];
    for (const flags of [args, [...args, "--yes"]]) {
      const result = await library(flags);
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ source_dirs: 0, bytes: 0 });
      expect(readFileSync(note, "utf8")).toBe("keep me");
    }
    expect(existsSync(libraryDir)).toBe(true);
  });

  test("prunes managed transcripts individually and preserves a user's corrected Markdown", async () => {
    const [id] = await seed([page("aaaaaaaaaaa", "Original interview")]);
    const { markdown_path: markdown, json_path: json } = JSON.parse(
      (await library(["show", id ?? "", "--json"])).stdout,
    );
    const dir = path.dirname(json);
    const note = path.join(dir, "my-notes.md");
    writeFileSync(note, "personal notes");
    for (const entry of readdirSync(dir)) utimesSync(path.join(dir, entry), new Date(0), new Date(0));
    const args = ["prune", "--include-transcripts", "--older-than", "30", "--json"];
    const preview = await library(args);
    expect(JSON.parse(preview.stdout)).toMatchObject({ source_dirs: 0, preserved: expect.any(Number) });
    expect(existsSync(json)).toBe(true);
    writeFileSync(markdown, "my corrections");
    utimesSync(markdown, new Date(0), new Date(0));
    const applied = await library([...args, "--yes"]);
    expect(applied.exitCode).toBe(0);
    expect(existsSync(json)).toBe(process.platform !== "win32");
    if (process.platform !== "win32")
      expect(JSON.parse(applied.stdout)).toMatchObject({ unsupported: true, bytes: 0, transcript_files: 0 });
    expect(readFileSync(markdown, "utf8")).toBe("my corrections");
    expect(readFileSync(note, "utf8")).toBe("personal notes");
  });

  test("concurrent saves for one source keep the receipts for both transcripts", async () => {
    const source = page("aaaaaaaaaaa", "Concurrent");
    const [[id]] = await Promise.all([seed([source], ["groq"]), seed([source], ["deepgram"])]);
    const dir = path.dirname(JSON.parse((await library(["show", id ?? "", "--json"])).stdout).json_path);
    for (const name of readdirSync(dir)) utimesSync(path.join(dir, name), new Date(0), new Date(0));
    const report = JSON.parse(
      (await library(["prune", "--older-than", "30", "--include-transcripts", "--json"])).stdout,
    );
    expect(report.transcript_files).toBe(process.platform === "win32" ? 4 : 0);
  });

  test.runIf(process.platform === "win32")(
    "the verified entry cannot be renamed or overwritten while pinned",
    async () => {
      const file = path.join(libraryDir, "artifact");
      writeFileSync(file, "original");
      const { pin } = await import("../../src/infrastructure/library/windows-handle.ts");
      const handle = pin(file, "file");
      try {
        expect(() => renameSync(file, `${file}.renamed`)).toThrow();
        expect(() => writeFileSync(file, "changed")).toThrow();
        expect(readFileSync(file, "utf8")).toBe("original");
      } finally {
        handle.close();
      }
      renameSync(file, `${file}.renamed`);
    },
  );

  test.runIf(process.platform === "win32")(
    "a library admission failure is audited for transcription and applied audio prune",
    async () => {
      const app = createApp(
        {
          adapter: "cli",
          env: { HOME: libraryDir, PI_TUBE_LIBRARY_DIR: libraryDir },
          cwd: libraryDir,
          homedir: () => libraryDir,
        },
        { stt: fakeProviders() },
      );
      const { pin } = await import("../../src/infrastructure/library/windows-handle.ts");
      const handle = pin(libraryDir, "prune-root");
      try {
        expect((await app.transcribe({ input: "test.mp3", format: "json" })).success).toBe(false);
        expect((await app.pruneLibrary({ includeTranscripts: false, dryRun: false })).success).toBe(false);
      } finally {
        handle.close();
      }
      const audit = await app.queryAudit({ offset: 0, limit: 10, errorsOnly: true });
      expect(audit.success && audit.data.records.map((r) => r.operation).sort()).toEqual([
        "library_prune",
        "transcribe",
      ]);
    },
  );

  test("listing a missing library does not create it", async () => {
    const missing = path.join(libraryDir, "missing");
    const result = await runCliInProcess(["library", "list", "--json"], { env: { PI_TUBE_LIBRARY_DIR: missing } });
    expect(result.exitCode).toBe(0);
    expect(existsSync(missing)).toBe(false);
  });

  test("CLI prune skips a library while an MCP transcription is using it", async () => {
    const [id] = await seed([page("aaaaaaaaaaa", "Existing")]);
    const shown = JSON.parse((await library(["show", id ?? "", "--json"])).stdout);
    for (const file of readdirSync(path.dirname(shown.json_path)))
      utimesSync(path.join(path.dirname(shown.json_path), file), new Date(0), new Date(0));
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const stt = fakeProviders();
    const app = createApp(
      {
        adapter: "mcp",
        env: { ...PROVIDER_KEYS, HOME: libraryDir, PI_TUBE_LIBRARY_DIR: libraryDir },
        cwd: libraryDir,
        homedir: () => libraryDir,
      },
      {
        stt: {
          ...stt,
          groq: {
            ...stt.groq,
            transcribe: async (...args) => {
              entered.resolve();
              await release.promise;
              return stt.groq.transcribe(...args);
            },
          },
        },
      },
    );
    const call = app.transcribe({ input: "https://example.invalid/test.mp3", provider: "groq", format: "json" });
    try {
      await entered.promise;
      const result = spawnCli(["library", "prune", "--older-than", "30", "--include-transcripts", "--yes", "--json"], {
        PI_TUBE_LIBRARY_DIR: libraryDir,
      });
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        bytes: 0,
        source_dirs: 0,
        ...(process.platform === "win32" ? { busy: true } : { unsupported: true }),
      });
      expect(existsSync(shown.json_path)).toBe(true);
    } finally {
      release.resolve();
      await call;
    }
  });

  test("never prunes through a directory junction in the configured library path", async () => {
    const [id] = await seed([page("aaaaaaaaaaa", "Outside")]);
    const { json_path: json } = JSON.parse((await library(["show", id ?? "", "--json"])).stdout);
    for (const file of readdirSync(path.dirname(json)))
      utimesSync(path.join(path.dirname(json), file), new Date(0), new Date(0));
    const aliasDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-junction-"));
    try {
      symlinkSync(path.dirname(libraryDir), path.join(aliasDir, "link"), "junction");
      const alias = path.join(aliasDir, "link", path.basename(libraryDir));
      for (const flag of [[], ["--yes"]]) {
        const result = await runCliInProcess(
          ["library", "prune", "--older-than", "30", "--include-transcripts", "--json", ...flag],
          { env: { PI_TUBE_LIBRARY_DIR: alias } },
        );
        expect(JSON.parse(result.stdout)).toMatchObject({ bytes: 0, source_dirs: 0 });
        expect(existsSync(json)).toBe(true);
      }
    } finally {
      rmSync(aliasDir, { recursive: true, force: true });
    }
  });

  test("replacing a receipted file after preview preserves the replacement, even with identical contents", async () => {
    const [id] = await seed([page("aaaaaaaaaaa", "Replacement")]);
    const { json_path: file } = JSON.parse((await library(["show", id ?? "", "--json"])).stdout);
    utimesSync(file, new Date(0), new Date(0));
    const args = ["prune", "--include-transcripts", "--older-than", "30", "--json"];
    expect(JSON.parse((await library(args)).stdout).transcript_files).toBe(process.platform === "win32" ? 1 : 0);
    const contents = readFileSync(file);
    renameSync(file, `${file}.original`);
    writeFileSync(file, contents);
    utimesSync(file, new Date(0), new Date(0));
    expect(JSON.parse((await library([...args, "--yes"])).stdout)).toMatchObject({
      bytes: 0,
      transcript_files: 0,
      failed: 0,
    });
    expect(readFileSync(file)).toEqual(contents);
  });

  test("a legacy source cannot prove the identity of a byte-identical replacement", async () => {
    const [id] = await seed([page("aaaaaaaaaaa", "Legacy")]);
    const { json_path: json, markdown_path: md } = JSON.parse((await library(["show", id ?? "", "--json"])).stdout);
    const dir = path.dirname(json);
    const sourceFile = path.join(dir, "source.json");
    const legacyMeta = { schema_version: 1, kind: "youtube", tier: "tested", source_key: "youtube:aaaaaaaaaaa" };
    writeFileSync(sourceFile, JSON.stringify(legacyMeta));
    const preview = await library(["prune", "--include-transcripts", "--older-than", "30", "--json"]);
    expect(JSON.parse(preview.stdout).transcript_files).toBe(0);
    renameSync(md, `${md}.original`);
    writeFileSync(md, readFileSync(`${md}.original`));
    for (const name of readdirSync(dir)) utimesSync(path.join(dir, name), new Date(0), new Date(0));
    const result = await library(["prune", "--include-transcripts", "--older-than", "30", "--yes", "--json"]);
    expect(JSON.parse(result.stdout)).toMatchObject({ transcript_files: 0, source_dirs: 0, failed: 0 });
    expect(existsSync(md)).toBe(true);
    expect(existsSync(json)).toBe(true);
    expect(existsSync(sourceFile)).toBe(true);
    // Newly published files in that same legacy folder have independent receipts; its old siblings still do not.
    await seed([page("aaaaaaaaaaa", "Legacy")], ["deepgram"]);
    for (const name of readdirSync(dir)) utimesSync(path.join(dir, name), new Date(0), new Date(0));
    const mixed = await library(["prune", "--include-transcripts", "--older-than", "30", "--yes", "--json"]);
    expect(JSON.parse(mixed.stdout).transcript_files).toBe(process.platform === "win32" ? 2 : 0);
    expect(readFileSync(md)).toEqual(readFileSync(`${md}.original`));
    expect(existsSync(json)).toBe(true);
  });

  test.runIf(process.platform === "win32")(
    "reports partial cleanup separately from safely preserved entries",
    async () => {
      const ids = await seed([page("aaaaaaaaaaa", "A"), page("bbbbbbbbbbb", "B")]);
      const dirs = [];
      for (const id of ids) {
        const dir = path.dirname(JSON.parse((await library(["show", id, "--json"])).stdout).json_path);
        for (const name of readdirSync(dir)) utimesSync(path.join(dir, name), new Date(0), new Date(0));
        dirs.push(dir);
      }
      const [writable, locked] = dirs;
      const native = await import("../../src/infrastructure/library/windows-handle.ts");
      const original = native.pin;
      const mock = vi.spyOn(native, "pin").mockImplementation((file, kind) => {
        if (file === locked) throw Object.assign(new Error("injected read failure"), { code: "EIO" });
        return original(file, kind);
      });
      try {
        const result = await library(["prune", "--include-transcripts", "--older-than", "30", "--yes", "--json"]);
        const report = JSON.parse(result.stdout);
        expect(result.exitCode).toBe(6);
        expect(report).toMatchObject({ source_dirs: 1, transcript_files: 2 });
        expect(report.failed).toBeGreaterThan(0);
        expect(existsSync(writable)).toBe(false);
        expect(existsSync(locked)).toBe(true);
      } finally {
        mock.mockRestore();
      }
    },
  );

  function previewAudio(args: string[]) {
    return spawnCli(["library", "prune", ...args], {
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: path.join(SPAWN_ROOT, "bun-cache"),
      HOME: libraryDir,
      PI_TUBE_LIBRARY_DIR: path.join(libraryDir, "library"),
      PI_TUBE_CONFIG_PATH: path.join(libraryDir, "config.json"),
    });
  }

  test("default audio preview leaves an empty home empty", () => {
    expect(previewAudio([]).exitCode).toBe(0);
    expect(readdirSync(libraryDir)).toEqual([]);
  });

  test.each(["age", "space"])("%s audio preview preserves home entries and file bytes", (mode) => {
    for (const [name, bytes] of [
      ["old", "older"],
      ["new", "new"],
    ] as const) {
      const dir = path.join(libraryDir, "library", name);
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, "audio.mp3");
      writeFileSync(file, bytes);
      if (name === "old") utimesSync(file, new Date(0), new Date(0));
    }
    const auditDir = path.join(libraryDir, ".pi-tube", "audit");
    mkdirSync(auditDir, { recursive: true });
    writeFileSync(path.join(auditDir, "2000-01.jsonl"), "{}");
    if (mode === "space") {
      writeFileSync(
        path.join(libraryDir, "config.json"),
        JSON.stringify({ ...DEFAULT_CONFIG, library: { max_audio_bytes: 3 } }),
      );
    }
    const snapshot = () =>
      readdirSync(libraryDir, { recursive: true, encoding: "utf8" })
        .sort()
        .map((entry) => {
          const file = path.join(libraryDir, entry);
          return [entry, statSync(file).isDirectory() ? null : readFileSync(file)];
        });
    const before = snapshot();
    const result = previewAudio(mode === "space" ? ["--json"] : ["--older-than", "30", "--json"]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ dry_run: true, audio_files: 1, source_dirs: 0, bytes: 5 });
    expect(snapshot()).toEqual(before);
  });

  test("transcript preview does not import or audit into an empty home", async () => {
    const home = path.join(libraryDir, "empty-home");
    mkdirSync(home);
    const result = await runCliInProcess(
      ["library", "prune", "--include-transcripts", "--older-than", "30", "--json"],
      { env: { HOME: home, PI_TUBE_LIBRARY_DIR: path.join(home, "library") } },
    );
    expect(result.exitCode).toBe(0);
    expect(readdirSync(home)).toEqual([]);
  });

  test("an empty directory supplied by the user is kept even after its managed artifacts are gone", async () => {
    const source = page("aaaaaaaaaaa", "First");
    const [id] = await seed([source]);
    const dir = path.dirname(JSON.parse((await library(["show", id ?? "", "--json"])).stdout).json_path);
    // Simulate a fresh pre-existing target directory without depending on the directory naming scheme.
    rmSync(dir, { recursive: true });
    mkdirSync(dir);
    await seed([source]);
    for (const name of readdirSync(dir)) utimesSync(path.join(dir, name), new Date(0), new Date(0));
    const result = await library(["prune", "--include-transcripts", "--older-than", "30", "--yes", "--json"]);
    expect(JSON.parse(result.stdout)).toMatchObject({
      source_dirs: 0,
      transcript_files: process.platform === "win32" ? 2 : 0,
      failed: 0,
    });
    expect(readdirSync(dir)).toHaveLength(process.platform === "win32" ? 0 : 3);
  });

  test("without --yes it only reports, and says how to delete", async () => {
    await seed([page("aaaaaaaaaaa", "Aula de Ação Penal")]);

    const result = await library(["prune"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(
      "[LIBRARY_PRUNE] dry_run=true audio_files=0 source_dirs=0 bytes=0\nRun again with --yes to delete.\n",
    );
  });

  test("--json reports the counts", async () => {
    const payload = JSON.parse((await library(["prune", "--yes", "--json"])).stdout);

    expect(payload).toEqual({ dry_run: false, audio_files: 0, source_dirs: 0, bytes: 0 });
  });

  test("--include-transcripts without --older-than is INPUT_INVALID", async () => {
    const result = await library(["prune", "--include-transcripts", "--yes"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("[INPUT_INVALID]");
    expect(result.stderr).toContain("--older-than");
  });

  test.each(["0", "1.5", "x"])("--older-than %s is INPUT_INVALID", async (days) => {
    const result = await library(["prune", "--older-than", days]);

    expect(result.exitCode).toBe(2);
  });
});

describe("library filters", () => {
  test("list --provider keeps only that provider's transcripts", async () => {
    const [groq] = await seed([page("aaaaaaaaaaa", "Aula"), page("bbbbbbbbbbb", "Aula 2")], ["groq", "deepgram"]);

    const listed = JSON.parse((await library(["list", "--provider", "groq", "--json"])).stdout);

    expect(listed.total).toBe(1);
    expect(listed.entries.map((entry: { transcript_id: string }) => entry.transcript_id)).toEqual([groq]);
  });

  test("search --source and --since/--until filter the matches", async () => {
    await seed([page("aaaaaaaaaaa", "Aula")]);

    const kept = JSON.parse(
      (
        await library([
          "search",
          "aula",
          "--source",
          "youtube",
          "--since",
          "2026-10-31",
          "--until",
          "2026-10-31",
          "--json",
        ])
      ).stdout,
    );
    const dropped = JSON.parse((await library(["search", "aula", "--source", "local_file", "--json"])).stdout);

    expect(kept.total).toBe(1);
    expect(dropped.total).toBe(0);
  });

  test("an unknown --source exits 2 with the kinds as the hint", async () => {
    const result = await library(["list", "--source", "tiktok"]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("[INPUT_INVALID] Unknown source kind `tiktok`.");
    expect(result.stderr).toContain("hint: Use one of: youtube, instagram, site, direct_url, local_file.");
  });

  test.each([
    ["show", "0123456789abcdef0123", "--provider", "groq"],
    ["prune", "--since", "2026-10-31"],
    ["import", "--source", "youtube"],
  ])("library %s refuses the list filters", async (...args) => {
    const result = await library(args);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(
      "[INPUT_INVALID] `--provider`, `--source`, `--since` and `--until` work only with `library list` and `library search`.",
    );
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

    for (const usage of ["library list", "library show <transcript_id>", "library search <query>", "library prune"]) {
      expect(result.stdout).toContain(usage);
    }
    for (const flag of ["--provider <id>", "--source <kind>", "--since <YYYY-MM-DD>", "--until <YYYY-MM-DD>"]) {
      expect(result.stdout).toContain(flag);
    }
  });
});
