import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { TranscriptKey } from "../../../src/core/domain/library.ts";
import type { ResolvedSource } from "../../../src/core/domain/source.ts";
import { buildOutputArtifact } from "../../../src/core/domain/transcript/build-artifact.ts";
import { renderJson } from "../../../src/core/domain/transcript/render-json.ts";
import {
  createFileLibraryStore,
  sourceDirName,
  transcriptIdOf,
} from "../../../src/infrastructure/library/file-library-store.ts";

const isWindows = process.platform === "win32";

let root: string;
let libraryDir: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "pi-tube-library-"));
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
  test("writes source.json, the JSON and the Markdown privately and finds them again", async () => {
    const store = createFileLibraryStore({ libraryDir });

    const saved = await store.save({ key: keyOf(), source: youtube(), artifact: artifactOf(youtube()) });

    expect(saved.success).toBe(true);
    if (!saved.success) return;
    const dir = path.dirname(saved.data.paths.json);
    expect(readdirSync(dir).sort()).toEqual(
      [`${saved.data.transcriptId}.json`, `${saved.data.transcriptId}.md`, "source.json"].sort(),
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

  test("a fresh save keeps the first transcript and writes <id>-2", async () => {
    const store = createFileLibraryStore({ libraryDir });
    const input = { key: keyOf(), source: youtube(), artifact: artifactOf(youtube()) };
    const first = await store.save(input);

    const fresh = await store.save({ ...input, fresh: true });

    const id = transcriptIdOf(keyOf());
    expect(first.success ? first.data.transcriptId : undefined).toBe(id);
    expect(fresh.success ? fresh.data.transcriptId : undefined).toBe(`${id}-2`);
    expect(fresh.success ? fresh.data.artifact.transcript_id : undefined).toBe(`${id}-2`);
    const found = await store.find(keyOf());
    expect(found.success ? found.data?.transcriptId : undefined).toBe(id);
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

  test("a direct URL ignores its query", async () => {
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
