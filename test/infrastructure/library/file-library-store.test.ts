import {
  chmodSync,
  existsSync,
  linkSync,
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
import type { TranscriptKey } from "../../../src/core/domain/library.ts";
import type { ResolvedSource } from "../../../src/core/domain/source.ts";
import { buildOutputArtifact } from "../../../src/core/domain/transcript/build-artifact.ts";
import { renderJson } from "../../../src/core/domain/transcript/render-json.ts";
import * as renderer from "../../../src/core/domain/transcript/render-markdown.ts";
import {
  createFileLibraryStore,
  sourceDirName,
  transcriptIdOf,
} from "../../../src/infrastructure/library/file-library-store.ts";
import * as activity from "../../../src/infrastructure/library/library-activity.ts";

import * as safeFiles from "../../../src/infrastructure/library/transcript-cleanup.ts";

const isWindows = process.platform === "win32";

let root: string;
let libraryDir: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "pi-tube-library-")));
  libraryDir = path.join(root, "library");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const youtube = (id = "jNQXAC9IVRw", title = "Me at the zoo"): ResolvedSource => ({
  kind: "youtube",
  originalInput: `https://u:p@www.youtube.com/watch?v=${id}`,
  normalizedUrl: `https://u:p@www.youtube.com/watch?v=${id}`,
  metadata: { platform: "Youtube", mediaId: id, title },
});

const artifactOf = (source: ResolvedSource, detectedLanguage = "en", generatedAt = "2026-10-31T00:00:00.000Z") =>
  buildOutputArtifact(
    { source, provider: "groq", model: "whisper-large-v3", transcript: "hello", detectedLanguage },
    { generatedAt, includeTimestamps: true },
  );

const keyOf = (language?: string): TranscriptKey => ({
  sourceKey: "youtube:jNQXAC9IVRw",
  provider: "groq",
  model: "whisper-large-v3",
  ...(language ? { language } : {}),
});

describe("source directories", () => {
  test("ids that differ only in case get different directories", () => {
    const upper = sourceDirName("youtube:abcDEF12345");
    const lower = sourceDirName("youtube:abcdef12345");

    expect(upper).not.toBe(lower);
    expect(upper.startsWith("youtube-abc")).toBe(true);
    expect(upper.length).toBeLessThanOrEqual(71);
  });

  test("a transcript id is 20 hex characters and depends on every key part", () => {
    expect(transcriptIdOf(keyOf())).toMatch(/^[0-9a-f]{20}$/);
    expect(transcriptIdOf(keyOf("pt"))).not.toBe(transcriptIdOf(keyOf()));
  });
});

describe("save and find", () => {
  test("an older managed rendering remains available only while both published files are intact", async () => {
    const store = createFileLibraryStore({ libraryDir });
    const key = keyOf();
    const source = youtube();
    const oldRenderer = vi.spyOn(renderer, "renderMarkdown").mockReturnValueOnce("old renderer output");
    const saved = await store.save({ key, source, artifact: artifactOf(source) });
    oldRenderer.mockRestore();
    if (!saved.success) throw Error("save failed");
    expect(await store.find(key)).toMatchObject({ success: true, data: { transcriptId: saved.data.transcriptId } });
    // Two canonical IDs can share the abbreviated filename. A receipt isn't evidence for which ID published it.
    const ambiguous = path.join(
      path.dirname(saved.data.paths.json),
      `${saved.data.transcriptId.slice(0, 8)}000000000000.json`,
    );
    writeFileSync(ambiguous, readFileSync(saved.data.paths.json));
    expect(await store.find(key)).toMatchObject({ success: false, error: { code: "STORAGE_IO_FAILED" } });
    rmSync(ambiguous);
    const bytes = readFileSync(saved.data.paths.json, "utf8").replaceAll("hello", "modified transcript");
    writeFileSync(saved.data.paths.json, bytes);
    expect(await store.find(key)).toMatchObject({ success: false, error: { code: "STORAGE_IO_FAILED" } });
    expect(readFileSync(saved.data.paths.markdown, "utf8")).toBe("old renderer output");
  });

  test("a new JSON generation cannot inherit an earlier generation's rendering", async () => {
    const store = createFileLibraryStore({ libraryDir });
    const input = { key: keyOf(), source: youtube(), artifact: artifactOf(youtube()) };
    const first = await store.save(input);
    if (!first.success) throw Error("save failed");
    const { paths, transcriptId } = first.data;
    const a = readFileSync(paths.json);
    const md = readFileSync(paths.markdown);
    expect(await store.get(transcriptId)).toMatchObject({ success: true, data: { transcriptId } });
    expect(readFileSync(paths.json)).toEqual(a);
    renameSync(paths.json, path.join(root, "A.json"));
    input.artifact.transcript.full_text = "generation B";
    const failure = {
      success: false,
      error: { code: "STORAGE_IO_FAILED", message: expect.stringContaining(paths.json) },
    };
    expect(await store.save(input)).toMatchObject(failure);
    const b = readFileSync(paths.json);
    expect(JSON.parse(b.toString())).toMatchObject({
      transcript_id: transcriptId,
      transcript: { full_text: "generation B" },
    });
    expect(await store.find(input.key)).toMatchObject(failure);
    expect(await store.get(transcriptId)).toMatchObject(failure);
    expect(readFileSync(paths.markdown)).toEqual(md);
    expect(readFileSync(paths.json)).toEqual(b);
    expect(readFileSync(path.join(root, "A.json"))).toEqual(a);
  });

  test("a hard-linked metadata receipt cannot endorse an older rendering", async () => {
    const store = createFileLibraryStore({ libraryDir });
    vi.spyOn(renderer, "renderMarkdown").mockReturnValueOnce("older");
    const saved = await store.save({ key: keyOf(), source: youtube(), artifact: artifactOf(youtube()) });
    if (!saved.success) throw Error("save failed");
    linkSync(path.join(path.dirname(saved.data.paths.json), "source.json"), path.join(root, "outside"));
    expect(await store.get(saved.data.transcriptId)).toMatchObject({ success: false });
  });

  test.each(["get", "save"])("competing %s joins the serialized Markdown publication", async (operation) => {
    const input = { key: keyOf(), source: youtube(), artifact: artifactOf(youtube()) };
    const other = createFileLibraryStore({ libraryDir });
    const enter = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const producer = createFileLibraryStore({
      libraryDir,
      fs: {
        link: async (temp, target) => {
          if (target.endsWith(".md")) {
            enter.resolve();
            await release.promise;
          }
          linkSync(temp, target);
        },
      },
    }).save(input);
    await enter.promise;
    const peer = operation === "get" ? other.get(transcriptIdOf(input.key)) : other.save(input);
    release.resolve();
    expect(await peer).toMatchObject({ success: true });
    const saved = await producer;
    expect(saved.success).toBe(true);
    if (!saved.success) return;
    const meta = JSON.parse(readFileSync(path.join(path.dirname(saved.data.paths.json), "source.json"), "utf8"));
    expect(meta.cleanup.files[path.basename(saved.data.paths.markdown)]).toBeDefined();
  });

  describe.each([".json", ".md"])("publication generations for %s", (ext) => {
    test.each(["commit", "remove", "residual"])("reader of A cannot certify B: %s", async (outcome) => {
      const input = { key: keyOf(), source: youtube(), artifact: artifactOf(youtube()) };
      const a = Promise.withResolvers<void>(),
        b = Promise.withResolvers<void>();
      const failA = Promise.withResolvers<void>(),
        settleB = Promise.withResolvers<void>();
      const observed = Promise.withResolvers<void>();
      let attempts = 0;
      let bytes: Buffer | undefined;
      const copyFile = async (temp: string, target: string) => {
        expect(target.endsWith(ext)).toBe(true);
        const content = readFileSync(temp);
        writeFileSync(target, content, { flag: "wx" });
        if (++attempts === 1) {
          bytes = content;
          a.resolve();
          await failA.promise;
          rmSync(target);
          throw Error("A failed");
        }
        expect(content).toEqual(bytes);
        b.resolve();
        await settleB.promise;
        if (outcome === "commit") return;
        if (outcome === "remove") rmSync(target);
        throw Error("B failed");
      };
      const store = createFileLibraryStore({
        libraryDir,
        fs: {
          copyFile,
          link: async (temp, target) => {
            if (target.endsWith(ext)) throw Object.assign(Error("no links"), { code: "EPERM" });
            linkSync(temp, target);
          },
        },
      });
      const first = store.save(input);
      await a.promise;
      const retriedB = Promise.withResolvers<void>();
      let tokenA: string | undefined;
      let observationsOfB = 0;
      const safeRead = safeFiles.readUnlinkedFile;
      const spy = vi.spyOn(safeFiles, "readUnlinkedFile").mockImplementation(async (file) => {
        const value = await safeRead(file);
        if (file.endsWith(`${ext}.publication`) && value.toString().includes("pending:")) {
          if (tokenA === undefined) {
            tokenA = value.toString();
            observed.resolve();
            await b.promise;
          } else if (value.toString() !== tokenA && ++observationsOfB === 2) retriedB.resolve();
        }
        return value;
      });
      const reader = store.get(transcriptIdOf(input.key));
      await observed.promise;
      failA.resolve();
      expect((await first).success).toBe(false);
      const second = store.save(input);
      await b.promise;
      try {
        expect(await Promise.race([reader.then(() => "returned"), retriedB.promise.then(() => "pending")])).toBe(
          "pending",
        );
      } finally {
        settleB.resolve();
        const result = await second;
        spy.mockRestore();
        expect(result.success).toBe(outcome === "commit");
      }
      expect((await reader).success).toBe(outcome === "commit");
    });
  });

  test.each(["json", "markdown"] as const)(
    "a generation change during the actual %s read invalidates the captured bytes",
    async (kind) => {
      const input = { key: keyOf(), source: youtube(), artifact: artifactOf(youtube()) };
      const legacy = createFileLibraryStore({ libraryDir });
      const saved = await legacy.save(input);
      if (!saved.success) throw Error("setup failed");
      const target = saved.data.paths[kind];
      const safeRead = safeFiles.readUnlinkedFile;
      let replaced = false;
      const peer = createFileLibraryStore({
        libraryDir,
        fs: {
          link: async () => {
            throw Error("no links");
          },
          copyFile: async (temp, dest) => {
            writeFileSync(dest, readFileSync(temp), { flag: "wx" });
            throw Error("residual");
          },
        },
      });
      const spy = vi.spyOn(safeFiles, "readUnlinkedFile").mockImplementation(async (file) => {
        const bytes = await safeRead(file);
        if (file === target && !replaced) {
          replaced = true;
          rmSync(target);
          expect((await peer.save(input)).success).toBe(false);
        }
        return bytes;
      });
      try {
        expect((await legacy.get(saved.data.transcriptId)).success).toBe(false);
        expect(replaced).toBe(true);
      } finally {
        spy.mockRestore();
      }
    },
  );

  test.each(["record", "claim"])("a foreign %s is preserved and does not block another target", async (kind) => {
    const input = { key: keyOf(), source: youtube(), artifact: artifactOf(youtube()) };
    const dir = path.join(libraryDir, sourceDirName(input.key.sourceKey));
    mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `${transcriptIdOf(input.key)}.json`);
    const reserved = target + (kind === "record" ? ".publication" : ".publishing");
    writeFileSync(reserved, "foreign");
    const store = createFileLibraryStore({ libraryDir });
    const blocked = store.save(input);
    expect((await store.save({ ...input, key: keyOf("fr") })).success).toBe(true);
    expect((await blocked).success).toBe(false);
    expect(readFileSync(reserved, "utf8")).toBe("foreign");
    expect(existsSync(target)).toBe(false);
    if (kind === "record") expect((await store.find(input.key)).success).toBe(false);
  });

  test("atomic links need no persistent record and a healthy legacy hit does not take admission", async () => {
    const entered = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>();
    const input = { key: keyOf(), source: youtube(), artifact: artifactOf(youtube()) };
    const store = createFileLibraryStore({
      libraryDir,
      fs: {
        link: async (temp, target) => {
          linkSync(temp, target);
          if (target.endsWith(".json")) {
            entered.resolve();
            await release.promise;
          }
        },
      },
    });
    const producer = store.save(input);
    await entered.promise;
    const safeRead = safeFiles.readUnlinkedFile;
    const spy = vi.spyOn(safeFiles, "readUnlinkedFile").mockImplementation(async (file) => {
      try {
        return await safeRead(file);
      } finally {
        if (file.endsWith(".json")) release.resolve();
      }
    });
    const peer = store.get(transcriptIdOf(input.key));
    try {
      expect((await peer).success).toBe(true);
    } finally {
      release.resolve();
      spy.mockRestore();
    }
    const saved = await producer;
    if (!saved.success) throw Error("atomic save failed");
    for (const file of Object.values(saved.data.paths)) {
      expect(existsSync(`${file}.publication`)).toBe(false);
      mkdirSync(`${file}.publishing`);
    }
    expect((await store.find(input.key)).success).toBe(true);
    for (const file of Object.values(saved.data.paths)) expect(existsSync(`${file}.publishing`)).toBe(true);
  });

  test("fallback records are neither transcript entries nor deletable cleanup receipts", async () => {
    const store = createFileLibraryStore({
      libraryDir,
      fs: {
        link: async () => {
          throw Error("no links");
        },
      },
    });
    const saved = await store.save({ key: keyOf(), source: youtube(), artifact: artifactOf(youtube()) });
    if (!saved.success) throw Error("fallback save failed");
    expect(await store.entries()).toMatchObject({ success: true, data: [{ transcriptId: saved.data.transcriptId }] });
    for (const file of Object.values(saved.data.paths)) utimesSync(file, 0, 0);
    expect(await store.prune({ olderThanDays: 1, includeTranscripts: true, dryRun: false })).toMatchObject({
      success: true,
      data: { transcriptFiles: 0 },
    });
    for (const file of Object.values(saved.data.paths))
      expect(readFileSync(`${file}.publication`, "utf8")).toContain("committed:");
    expect((await store.get(saved.data.transcriptId)).success).toBe(true);
  });

  test("a stale publication temp neither endorses a linked destination nor waits indefinitely", async () => {
    const store = createFileLibraryStore({ libraryDir });
    const saved = await store.save({ key: keyOf(), source: youtube(), artifact: artifactOf(youtube()) });
    if (!saved.success) throw Error("save failed");
    const md = saved.data.paths.markdown;
    const stale = `${md}.123.00000000-0000-4000-8000-000000000000.tmp`;
    linkSync(md, stale);
    expect(await store.get(saved.data.transcriptId)).toMatchObject({ success: false });
    expect(existsSync(stale)).toBe(true);
  }, 8000);

  test("unavailable metadata locking does not prevent publication", async () => {
    vi.spyOn(activity, "withSourceWriter").mockRejectedValueOnce(Error("unavailable"));
    const store = createFileLibraryStore({ libraryDir });
    const saved = await store.save({ key: keyOf(), source: youtube(), artifact: artifactOf(youtube()) });
    expect(saved.success).toBe(true);
    if (!saved.success) return;
    expect(existsSync(path.join(path.dirname(saved.data.paths.json), "source.json"))).toBe(false);
    expect(await store.get(saved.data.transcriptId)).toMatchObject({ success: true });
  });

  test.each(["directory", "hardlink", ...(isWindows ? [] : ["symlink"])])(
    "rejects a %s at the Markdown path",
    async (kind) => {
      const store = createFileLibraryStore({ libraryDir });
      const source = youtube();
      const saved = await store.save({ key: keyOf(), source, artifact: artifactOf(source) });
      if (!saved.success) throw Error("save failed");
      const markdown = saved.data.paths.markdown;
      const other = path.join(root, "outside");
      const bytes = readFileSync(markdown);
      renameSync(markdown, other);
      if (kind === "directory") mkdirSync(markdown);
      else if (kind === "hardlink") linkSync(other, markdown);
      else symlinkSync(other, markdown);
      expect(await store.get(saved.data.transcriptId)).toMatchObject({
        success: false,
        error: { code: "STORAGE_IO_FAILED" },
      });
      expect(readFileSync(other)).toEqual(bytes);
    },
  );

  test("a Markdown collision on save or repair preserves both files without claiming success", async () => {
    let markdown = "";
    const store = createFileLibraryStore({
      libraryDir,
      fs: {
        link: async (temp, target) => {
          if (target.endsWith(".md")) {
            markdown = target;
            writeFileSync(target, "sentinel", { flag: "wx" });
          }
          linkSync(temp, target);
        },
      },
    });
    const source = youtube();
    const key = keyOf();
    const id = transcriptIdOf(key);
    const saved = path.join(libraryDir, sourceDirName(key.sourceKey), `${id}.json`);
    const failure = { success: false, error: { code: "STORAGE_IO_FAILED", message: expect.stringContaining(saved) } };
    expect(await store.save({ key, source, artifact: artifactOf(source) })).toMatchObject(failure);
    const bytes = readFileSync(saved);
    expect(readFileSync(markdown, "utf8")).toBe("sentinel");
    rmSync(markdown);
    expect(await store.get(id)).toMatchObject(failure);
    expect(readFileSync(markdown, "utf8")).toBe("sentinel");
    expect(readFileSync(saved)).toEqual(bytes);
  });

  test("writes source.json, the JSON and the Markdown privately and finds them again", async () => {
    const store = createFileLibraryStore({ libraryDir });

    const saved = await store.save({ key: keyOf(), source: youtube(), artifact: artifactOf(youtube()) });

    expect(saved.success).toBe(true);
    if (!saved.success) return;
    const dir = path.dirname(saved.data.paths.json);
    expect(readdirSync(dir).sort()).toEqual(
      [
        `${saved.data.transcriptId}.json`,
        `2026-10-31-me-at-the-zoo-${saved.data.transcriptId.slice(0, 8)}.md`,
        "source.json",
      ].sort(),
    );
    expect(path.basename(saved.data.paths.markdown)).toBe(
      `2026-10-31-me-at-the-zoo-${saved.data.transcriptId.slice(0, 8)}.md`,
    );
    expect(saved.data.artifact.transcript_id).toBe(saved.data.transcriptId);
    expect(saved.data.artifact.source.source_key).toBe("youtube:jNQXAC9IVRw");
    if (!isWindows) {
      expect(statSync(dir).mode & 0o777).toBe(0o700);
      for (const file of readdirSync(dir)) expect(statSync(path.join(dir, file)).mode & 0o777).toBe(0o600);
    }
    const found = await store.find(keyOf());
    expect(found.success ? found.data?.transcriptId : undefined).toBe(saved.data.transcriptId);
  });

  test("an auto transcript that detected en answers a request for en, not for pt", async () => {
    const store = createFileLibraryStore({ libraryDir });
    await store.save({ key: keyOf(), source: youtube(), artifact: artifactOf(youtube(), "en") });

    const en = await store.find(keyOf("en"));
    const pt = await store.find(keyOf("pt"));

    expect(en.success ? en.data?.artifact.transcription.detected_language : undefined).toBe("en");
    expect(pt.success ? pt.data : "error").toBeUndefined();
  });

  test("the language rule compares primary languages, whatever form the provider used", async () => {
    const store = createFileLibraryStore({ libraryDir });
    // A transcript saved before normalization, with Groq's language name.
    await store.save({ key: keyOf(), source: youtube(), artifact: artifactOf(youtube(), "Portuguese") });

    const pt = await store.find(keyOf("pt"));
    const ptBr = await store.find(keyOf("pt-br"));
    const en = await store.find(keyOf("en"));

    expect(pt.success ? pt.data?.transcriptId : undefined).toBe(transcriptIdOf(keyOf()));
    expect(ptBr.success ? ptBr.data?.transcriptId : undefined).toBe(transcriptIdOf(keyOf()));
    expect(en.success ? en.data : "error").toBeUndefined();
  });

  test("a transcript requested in pt answers pt only", async () => {
    const store = createFileLibraryStore({ libraryDir });
    await store.save({ key: keyOf("pt"), source: youtube(), artifact: artifactOf(youtube(), "pt") });

    const auto = await store.find(keyOf());
    expect(auto.success ? auto.data : "error").toBeUndefined();
    const pt = await store.find(keyOf("pt"));
    expect(pt.success ? pt.data?.transcriptId : undefined).toBe(transcriptIdOf(keyOf("pt")));
  });

  test("two saves of the same key at once give one transcript and no error", async () => {
    const store = createFileLibraryStore({ libraryDir });
    const input = { key: keyOf(), source: youtube(), artifact: artifactOf(youtube()) };

    const [first, second] = await Promise.all([store.save(input), store.save(input)]);

    expect(first.success && second.success).toBe(true);
    if (!first.success || !second.success) return;
    expect(second.data.transcriptId).toBe(first.data.transcriptId);
    const dir = path.dirname(first.data.paths.json);
    expect(readdirSync(dir).filter((name) => name.endsWith(".json") && name !== "source.json")).toHaveLength(1);
  });

  test("a fresh save keeps the first transcript, writes <id>-2, and the cache serves <id>-2 from then on", async () => {
    const store = createFileLibraryStore({ libraryDir });
    const input = { key: keyOf(), source: youtube(), artifact: artifactOf(youtube()) };
    const first = await store.save(input);

    const fresh = await store.save({ ...input, fresh: true });

    const id = transcriptIdOf(keyOf());
    expect(first.success ? first.data.transcriptId : undefined).toBe(id);
    expect(fresh.success ? fresh.data.transcriptId : undefined).toBe(`${id}-2`);
    expect(fresh.success ? fresh.data.artifact.transcript_id : undefined).toBe(`${id}-2`);
    const found = await store.find(keyOf());
    expect(found.success ? found.data?.transcriptId : undefined).toBe(`${id}-2`);
    expect(existsSync(path.join(path.dirname(fresh.success ? fresh.data.paths.json : ""), `${id}.json`))).toBe(true);
  });

  test("a missing Markdown file is written again from the saved JSON", async () => {
    const store = createFileLibraryStore({ libraryDir });
    const saved = await store.save({ key: keyOf(), source: youtube(), artifact: artifactOf(youtube()) });
    if (!saved.success) throw new Error("save failed");
    rmSync(saved.data.paths.markdown);

    const found = await store.find(keyOf());

    expect(found.success ? found.data?.paths.markdown : undefined).toBe(saved.data.paths.markdown);
    expect(existsSync(saved.data.paths.markdown)).toBe(true);
    expect(readFileSync(saved.data.paths.markdown, "utf8")).toContain("Me at the zoo");
  });

  test("a save leaves no temp files behind", async () => {
    const store = createFileLibraryStore({ libraryDir });
    const saved = await store.save({ key: keyOf(), source: youtube(), artifact: artifactOf(youtube()) });
    if (!saved.success) throw new Error("save failed");

    expect(readdirSync(path.dirname(saved.data.paths.json)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  test("a source.json that cannot be written does not lose the transcript", async () => {
    const store = createFileLibraryStore({ libraryDir });
    mkdirSync(path.join(libraryDir, sourceDirName("youtube:jNQXAC9IVRw"), "source.json"), { recursive: true });

    const saved = await store.save({ key: keyOf(), source: youtube(), artifact: artifactOf(youtube()) });

    expect(saved.success).toBe(true);
    expect(saved.success ? existsSync(saved.data.paths.json) && existsSync(saved.data.paths.markdown) : false).toBe(
      true,
    );
  });

  test("a corrupt saved transcript names its file and how to get past it", async () => {
    const store = createFileLibraryStore({ libraryDir });
    const saved = await store.save({ key: keyOf(), source: youtube(), artifact: artifactOf(youtube()) });
    if (!saved.success) throw new Error("save failed");
    writeFileSync(saved.data.paths.json, "{");

    const found = await store.find(keyOf());

    expect(found.success).toBe(false);
    if (found.success) return;
    expect(found.error.code).toBe("STORAGE_IO_FAILED");
    expect(found.error.message).toContain(saved.data.paths.json);
    expect(found.error.hint).toContain("--force");
  });

  test("without hard links the transcript is still published once, never overwritten", async () => {
    const noLinks = { link: async () => Promise.reject(Object.assign(new Error("EPERM"), { code: "EPERM" })) };
    const store = createFileLibraryStore({ libraryDir, fs: noLinks });
    const input = { key: keyOf(), source: youtube(), artifact: artifactOf(youtube()) };

    const first = await store.save(input);
    const second = await store.save({ ...input, artifact: artifactOf(youtube(), "en", "2027-01-01T00:00:00.000Z") });

    expect(first.success && second.success).toBe(true);
    if (!first.success || !second.success) return;
    expect(second.data.transcriptId).toBe(first.data.transcriptId);
    expect(second.data.artifact.generated_at).toBe("2026-10-31T00:00:00.000Z");
  });

  test("source.json keeps no credentials", async () => {
    const store = createFileLibraryStore({ libraryDir });
    const saved = await store.save({ key: keyOf(), source: youtube(), artifact: artifactOf(youtube()) });
    if (!saved.success) throw new Error("save failed");

    const sourceJson = readFileSync(path.join(path.dirname(saved.data.paths.json), "source.json"), "utf8");

    expect(sourceJson).not.toContain("u:p@");
    expect(JSON.parse(sourceJson)).toMatchObject({
      schema_version: 1,
      source_key: "youtube:jNQXAC9IVRw",
      kind: "youtube",
    });
  });
});

describe("get and entries", () => {
  test("a stray file at the library root (.DS_Store) does not break get", async () => {
    const store = createFileLibraryStore({ libraryDir });
    const saved = await store.save({ key: keyOf(), source: youtube(), artifact: artifactOf(youtube()) });
    if (!saved.success) throw new Error("save failed");
    writeFileSync(path.join(libraryDir, ".DS_Store"), "x");

    const found = await store.get(saved.data.transcriptId);
    const entries = await store.entries();

    expect(found.success ? found.data?.transcriptId : undefined).toBe(saved.data.transcriptId);
    expect(entries.success ? entries.data.length : 0).toBe(1);
  });

  test("get finds a transcript by id, and an unknown id is undefined", async () => {
    const store = createFileLibraryStore({ libraryDir });
    const saved = await store.save({ key: keyOf(), source: youtube(), artifact: artifactOf(youtube()) });
    if (!saved.success) throw new Error("save failed");

    const found = await store.get(saved.data.transcriptId);
    const missing = await store.get("ffffffffffffffffffff");

    expect(found.success ? found.data?.artifact.transcript.full_text : undefined).toBe("hello");
    expect(missing.success ? missing.data : "error").toBeUndefined();
  });

  test("entries are newest first, carry the source name and skip a corrupt file", async () => {
    const store = createFileLibraryStore({ libraryDir });
    const local: ResolvedSource = {
      kind: "local_file",
      originalInput: "entrevista.mp3",
      absolutePath: path.join(root, "entrevista.mp3"),
      extension: "mp3",
      sizeBytes: 1,
    };
    await store.save({
      key: keyOf(),
      source: youtube(),
      artifact: artifactOf(youtube(), "en", "2026-10-30T00:00:00.000Z"),
    });
    const second = await store.save({
      key: { sourceKey: "file:abc", provider: "groq", model: "whisper-large-v3" },
      source: local,
      artifact: artifactOf(local, "en", "2026-10-31T00:00:00.000Z"),
    });
    if (!second.success) throw new Error("save failed");
    writeFileSync(path.join(path.dirname(second.data.paths.json), "broken.json"), "{");

    const entries = await store.entries();

    expect(entries.success ? entries.data.map((entry) => entry.sourceKey) : undefined).toEqual([
      "file:abc",
      "youtube:jNQXAC9IVRw",
    ]);
    expect(entries.success ? entries.data[0] : undefined).toMatchObject({
      kind: "local_file",
      sourceName: "entrevista.mp3",
      provider: "groq",
      model: "whisper-large-v3",
      characters: 5,
    });
    expect(entries.success ? entries.data[1] : undefined).toMatchObject({
      title: "Me at the zoo",
      platform: "Youtube",
    });
  });

  test("a library that does not exist yet has no entries", async () => {
    const entries = await createFileLibraryStore({ libraryDir }).entries();

    expect(entries).toEqual({ success: true, data: [] });
  });

  test("1,000 transcripts are listed in under a second", async () => {
    const artifact = artifactOf(youtube());
    for (let index = 0; index < 1000; index += 1) {
      const dir = path.join(libraryDir, `youtube-x-${index}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        path.join(dir, `${String(index).padStart(20, "0")}.json`),
        renderJson({ ...artifact, transcript_id: String(index) }),
      );
    }
    const startedAt = performance.now();

    const entries = await createFileLibraryStore({ libraryDir }).entries();

    expect(entries.success ? entries.data.length : 0).toBe(1000);
    expect(performance.now() - startedAt).toBeLessThan(1000);
  });
});

describe("sourceKeyOf", () => {
  const store = () => createFileLibraryStore({ libraryDir });

  test("a page with an id is <extractor>:<id>", async () => {
    expect(await store().sourceKeyOf(youtube())).toEqual({ success: true, data: "youtube:jNQXAC9IVRw" });
  });

  test("a page without an id is keyed by its URL without credentials", async () => {
    const page = (url: string): ResolvedSource => ({
      kind: "site",
      originalInput: url,
      normalizedUrl: url,
      metadata: { platform: "Generic" },
    });

    const plain = await store().sourceKeyOf(page("https://example.com/talk"));
    const withCredentials = await store().sourceKeyOf(page("https://u:p@example.com/talk"));

    expect(plain.success ? plain.data : "").toMatch(/^url:[0-9a-f]{64}$/);
    expect(withCredentials).toEqual(plain);
  });

  test("two Generic pages with the same base name get different keys (yt-dlp gives both the same id)", async () => {
    const generic = (url: string): ResolvedSource => ({
      kind: "site",
      originalInput: url,
      normalizedUrl: url,
      metadata: { platform: "Generic", mediaId: "video" },
    });

    const first = await store().sourceKeyOf(generic("https://a.example/video.php?id=1"));
    const second = await store().sourceKeyOf(generic("https://a.example/video.php?id=2"));

    expect(first.success ? first.data : "").toMatch(/^url:[0-9a-f]{64}$/);
    expect(second).not.toEqual(first);
  });

  test("a direct URL keeps the query that names the media and drops only signature parameters", async () => {
    const direct = (query: string): ResolvedSource => ({
      kind: "direct_url",
      originalInput: `https://cdn.example.com/play.mp3${query}`,
      normalizedUrl: `https://cdn.example.com/play.mp3${query}`,
      mediaUrl: `https://cdn.example.com/play.mp3${query}`,
      extension: "mp3",
    });

    const episode12 = await store().sourceKeyOf(direct("?episode=12"));
    const episode13 = await store().sourceKeyOf(direct("?episode=13"));
    const signedA = await store().sourceKeyOf(direct("?episode=12&X-Amz-Signature=a&X-Amz-Expires=60"));
    const signedB = await store().sourceKeyOf(direct("?X-Amz-Expires=99&episode=12&X-Amz-Signature=b#t=3"));

    expect(episode13).not.toEqual(episode12);
    expect(signedA).toEqual(episode12);
    expect(signedB).toEqual(episode12);
  });

  test("a direct URL ignores a signature parameter", async () => {
    const direct = (query: string): ResolvedSource => ({
      kind: "direct_url",
      originalInput: `https://cdn.example.com/a.mp3${query}`,
      normalizedUrl: `https://cdn.example.com/a.mp3${query}`,
      mediaUrl: `https://cdn.example.com/a.mp3${query}`,
      extension: "mp3",
    });

    expect(await store().sourceKeyOf(direct("?sig=1"))).toEqual(await store().sourceKeyOf(direct("?sig=2")));
  });

  test("a local file is keyed by its content, not its path", async () => {
    const first = path.join(root, "a.mp3");
    const second = path.join(root, "b.mp3");
    writeFileSync(first, "same audio");
    writeFileSync(second, "same audio");
    const local = (file: string): ResolvedSource => ({
      kind: "local_file",
      originalInput: file,
      absolutePath: file,
      extension: "mp3",
      sizeBytes: 10,
    });

    const a = await store().sourceKeyOf(local(first));
    const b = await store().sourceKeyOf(local(second));

    expect(a.success ? a.data : "").toMatch(/^file:[0-9a-f]{64}$/);
    expect(b).toEqual(a);
  });
});

describe("audio", () => {
  const DAY_MS = 86_400_000;
  const audioFile = (name: string, bytes = 10): string => {
    const file = path.join(root, name);
    writeFileSync(file, "x".repeat(bytes));
    return file;
  };
  const seedSource = async (store: ReturnType<typeof createFileLibraryStore>, id: string) => {
    const source = youtube(id, `Video ${id}`);
    const key = { sourceKey: `youtube:${id}`, provider: "groq", model: "whisper-large-v3" };
    const saved = await store.save({ key, source, artifact: artifactOf(source) });
    if (!saved.success) throw new Error("save failed");
    return { key, dir: path.dirname(saved.data.paths.json) };
  };
  const audioLeft = (): string[] =>
    readdirSync(libraryDir).flatMap((dir) =>
      readdirSync(path.join(libraryDir, dir))
        .filter((name) => name.startsWith("audio."))
        .map((name) => `${dir}/${name}`),
    );
  const transcriptsLeft = (): number =>
    readdirSync(libraryDir).flatMap((dir) =>
      readdirSync(path.join(libraryDir, dir)).filter((name) => name.endsWith(".md")),
    ).length;
  const age = (target: string, days: number): void => {
    const when = new Date(Date.now() - days * DAY_MS);
    utimesSync(target, when, when);
  };

  test("keepAudio moves the file into the source directory, and storedSource gives source and audio back", async () => {
    const store = createFileLibraryStore({ libraryDir });
    const { dir } = await seedSource(store, "aaaaaaaaaaa");
    const downloaded = audioFile("abc.m4a");

    const kept = await store.keepAudio("youtube:aaaaaaaaaaa", downloaded);
    const stored = await store.storedSource("youtube:aaaaaaaaaaa");

    expect(kept).toEqual({ success: true, data: path.join(dir, "audio.m4a") });
    expect(existsSync(downloaded)).toBe(false);
    if (!isWindows) expect(statSync(path.join(dir, "audio.m4a")).mode & 0o777).toBe(0o600);
    expect(stored.success ? stored.data : undefined).toEqual({
      source: {
        kind: "youtube",
        originalInput: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
        normalizedUrl: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
        metadata: { platform: "Youtube", mediaId: "aaaaaaaaaaa", title: "Video aaaaaaaaaaa" },
      },
      audioPath: path.join(dir, "audio.m4a"),
    });
  });

  test("a source without kept audio has a stored source but no audio path", async () => {
    const store = createFileLibraryStore({ libraryDir });
    await seedSource(store, "aaaaaaaaaaa");

    const stored = await store.storedSource("youtube:aaaaaaaaaaa");
    const missing = await store.storedSource("youtube:zzzzzzzzzzz");

    expect(stored.success ? stored.data?.audioPath : "error").toBeUndefined();
    expect(missing.success ? missing.data : "error").toBeUndefined();
  });

  test("past max_audio_bytes the oldest audio goes, never the new one and never a transcript", async () => {
    const store = createFileLibraryStore({ libraryDir });
    for (const [index, id] of ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"].entries()) {
      await seedSource(store, id);
      const kept = await store.keepAudio(`youtube:${id}`, audioFile(`${index}.m4a`), 15);
      if (!kept.success) throw new Error("keep failed");
      age(kept.data, 3 - index);
    }

    expect(audioLeft()).toHaveLength(1);
    expect(audioLeft()[0]).toContain("youtube-ccccccccccc");
    expect(transcriptsLeft()).toBe(3);
  });

  test("a new audio larger than max_audio_bytes on its own is still kept", async () => {
    const store = createFileLibraryStore({ libraryDir });
    await seedSource(store, "aaaaaaaaaaa");

    const kept = await store.keepAudio("youtube:aaaaaaaaaaa", audioFile("big.m4a", 10), 5);

    expect(kept.success).toBe(true);
    expect(audioLeft()).toHaveLength(1);
  });

  test("across file systems (EXDEV) the audio is copied through a temp file and nothing partial is left", async () => {
    const crossDevice = {
      rename: async (from: string, to: string) => {
        if (path.dirname(from) !== path.dirname(to)) throw Object.assign(new Error("EXDEV"), { code: "EXDEV" });
        renameSync(from, to);
      },
    };
    const store = createFileLibraryStore({ libraryDir, fs: crossDevice });
    const { dir } = await seedSource(store, "aaaaaaaaaaa");
    const downloaded = audioFile("a.m4a");

    const kept = await store.keepAudio("youtube:aaaaaaaaaaa", downloaded);

    expect(kept).toEqual({ success: true, data: path.join(dir, "audio.m4a") });
    expect(readFileSync(path.join(dir, "audio.m4a"), "utf8")).toBe("x".repeat(10));
    expect(readdirSync(dir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    expect(existsSync(downloaded)).toBe(false);
  });

  test.skipIf(isWindows || process.getuid?.() === 0)(
    "an eviction that cannot delete old audio does not fail the new keep",
    async () => {
      const store = createFileLibraryStore({ libraryDir });
      const old = await seedSource(store, "aaaaaaaaaaa");
      const kept = await store.keepAudio("youtube:aaaaaaaaaaa", audioFile("a.m4a"));
      if (!kept.success) throw new Error("keep failed");
      age(kept.data, 3);
      await seedSource(store, "bbbbbbbbbbb");
      chmodSync(old.dir, 0o500);

      try {
        const second = await store.keepAudio("youtube:bbbbbbbbbbb", audioFile("b.m4a"), 15);
        expect(second.success).toBe(true);
      } finally {
        chmodSync(old.dir, 0o700);
      }
    },
  );

  test("prune without --yes reports and deletes nothing; with it, deletes audio only", async () => {
    const store = createFileLibraryStore({ libraryDir });
    await seedSource(store, "aaaaaaaaaaa");
    await store.keepAudio("youtube:aaaaaaaaaaa", audioFile("a.m4a"));

    const dry = await store.prune({ includeTranscripts: false, dryRun: true });
    expect(dry).toEqual({ success: true, data: { audioFiles: 1, sourceDirs: 0, bytes: 10, dryRun: true } });
    expect(audioLeft()).toHaveLength(1);

    const real = await store.prune({ includeTranscripts: false, dryRun: false });
    expect(real.success ? real.data : undefined).toMatchObject({
      audioFiles: 1,
      sourceDirs: 0,
      bytes: 10,
      dryRun: false,
    });
    expect(audioLeft()).toHaveLength(0);
    expect(transcriptsLeft()).toBe(1);
  });

  test("prune --older-than keeps recent audio", async () => {
    const store = createFileLibraryStore({ libraryDir });
    await seedSource(store, "aaaaaaaaaaa");
    await seedSource(store, "bbbbbbbbbbb");
    const old = await store.keepAudio("youtube:aaaaaaaaaaa", audioFile("a.m4a"));
    await store.keepAudio("youtube:bbbbbbbbbbb", audioFile("b.m4a"));
    if (!old.success) throw new Error("keep failed");
    age(old.data, 40);

    const pruned = await store.prune({ olderThanDays: 30, includeTranscripts: false, dryRun: false });

    expect(pruned.success ? pruned.data.audioFiles : undefined).toBe(1);
    expect(audioLeft().map((entry) => entry.split("/")[0]?.startsWith("youtube-bbbbbbbbbbb"))).toEqual([true]);
  });

  test("prune --include-transcripts removes an owned directory once its old artifacts are gone", async () => {
    const store = createFileLibraryStore({ libraryDir });
    const old = await seedSource(store, "aaaaaaaaaaa");
    await seedSource(store, "bbbbbbbbbbb");
    for (const name of readdirSync(old.dir)) age(path.join(old.dir, name), 40);

    const pruned = await store.prune({ olderThanDays: 30, includeTranscripts: true, dryRun: false });

    expect(pruned.success ? pruned.data.sourceDirs : undefined).toBe(isWindows ? 1 : 0);
    expect(existsSync(old.dir)).toBe(!isWindows);
    expect(transcriptsLeft()).toBe(isWindows ? 1 : 2);
  });

  test("prune applies max_audio_bytes: the oldest audio goes until the rest fits", async () => {
    const store = createFileLibraryStore({ libraryDir });
    for (const [index, id] of ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"].entries()) {
      await seedSource(store, id);
      const kept = await store.keepAudio(`youtube:${id}`, audioFile(`${index}.m4a`));
      if (!kept.success) throw new Error("keep failed");
      age(kept.data, 3 - index);
    }

    const pruned = await store.prune({ includeTranscripts: false, dryRun: false, maxAudioBytes: 15 });

    expect(pruned.success ? pruned.data.audioFiles : undefined).toBe(2);
    expect(audioLeft()).toHaveLength(1);
    expect(audioLeft()[0]).toContain("youtube-ccccccccccc");
  });
});
