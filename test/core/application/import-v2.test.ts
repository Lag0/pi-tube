import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createImportV2Transcripts } from "../../../src/core/application/import-v2.ts";
import { createTranscribe } from "../../../src/core/application/transcribe.ts";
import { ok } from "../../../src/core/domain/result.ts";
import type { ImportSummary } from "../../../src/core/domain/transcript/parse-v2.ts";
import type { LegacyTranscriptFile, LegacyTranscripts } from "../../../src/core/ports/legacy-transcripts.ts";
import { createFileLibraryStore } from "../../../src/infrastructure/library/file-library-store.ts";
import { PROVIDER_DESCRIPTORS } from "../../../src/infrastructure/stt/registry.ts";
import { createFakeMediaFetcher } from "../../helpers/fake-media.ts";
import { createFakeSttProvider } from "../../helpers/fake-stt.ts";
import { auditDepsFor, createInMemoryAuditLog } from "../../helpers/in-memory-audit-log.ts";
import { createInMemoryConfigStore } from "../../helpers/in-memory-config-store.ts";

const FIXTURES = path.join("test", "fixtures", "v2");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

let root: string;
let libraryDir: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "pi-tube-import-v2-"));
  libraryDir = path.join(root, "library");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const v2File = (name: string, text: string): LegacyTranscriptFile => ({
  path: path.join("/home/me/.pi-tube", name),
  name,
  text,
  sha256: sha256(text),
});

const fixture = (fixtureName: string, v2Name: string): LegacyTranscriptFile =>
  v2File(v2Name, readFileSync(path.join(FIXTURES, fixtureName), "utf8"));

const ALL_FIXTURES = (): LegacyTranscriptFile[] => [
  fixture("json-golden.json", "2026-03-02-demo.json"),
  fixture("markdown-golden.md", "2026-03-02-demo.md"),
  fixture("youtube-default.md", "2026-03-05-me-at-the-zoo.md"),
  fixture("groq-timestamps.md", "2026-04-10-aula-1.md"),
  fixture("youtube-watch.json", "2026-03-06-me-at-the-zoo.json"),
];

const fakeLegacy = (
  files: readonly LegacyTranscriptFile[],
  options: { readonly imported?: boolean; readonly unreadable?: readonly { path: string; reason: string }[] } = {},
) => {
  let marked: ImportSummary | undefined;
  let filesCalls = 0;
  const legacy: LegacyTranscripts = {
    isImported: async () => options.imported === true || marked !== undefined,
    files: async () => {
      filesCalls += 1;
      return ok({ files, unreadable: options.unreadable ?? [] });
    },
    markImported: async (summary) => {
      marked = summary;
      return ok(undefined);
    },
  };
  return { legacy, marked: () => marked, filesCalls: () => filesCalls };
};

const setup = (
  files: readonly LegacyTranscriptFile[] = ALL_FIXTURES(),
  options: Parameters<typeof fakeLegacy>[1] = {},
) => {
  const library = createFileLibraryStore({ libraryDir });
  const fake = fakeLegacy(files, options);
  return { library, ...fake, importV2: createImportV2Transcripts({ legacy: fake.legacy, library }) };
};

const entriesOf = async (library: ReturnType<typeof createFileLibraryStore>) => {
  const entries = await library.entries();
  if (!entries.success) throw new Error(entries.error.message);
  return entries.data;
};

describe("importV2Transcripts", () => {
  test("imports v2 JSON and Markdown; a forced second run finds them already in the library", async () => {
    const { importV2, marked } = setup();

    const first = await importV2({});
    const second = await importV2({ force: true });

    expect(first).toEqual(ok({ ranBefore: false, found: 5, imported: 4, already: 1, skipped: [] }));
    expect(second).toEqual(ok({ ranBefore: false, found: 5, imported: 0, already: 5, skipped: [] }));
    expect(marked()).toMatchObject({ found: 5 });
  });

  test("a YouTube v2 JSON with the watch URL becomes a cache hit", async () => {
    const { importV2, library } = setup();
    await importV2({});
    const deepgram = { ...createFakeSttProvider("deepgram"), model: "nova-3" };
    const media = createFakeMediaFetcher();
    const transcribe = createTranscribe({
      configStore: createInMemoryConfigStore(),
      env: { DEEPGRAM_API_KEY: "dg" },
      providers: PROVIDER_DESCRIPTORS,
      stt: { deepgram },
      media: media.fetcher,
      library,
      now: () => new Date(),
      audit: auditDepsFor(createInMemoryAuditLog()),
    });

    const result = await transcribe({ input: "https://youtu.be/jNQXAC9IVRw", format: "markdown" });

    expect(result.success ? result.data.cacheHit : result).toBe(true);
    expect(media.calls.resolve).toHaveLength(0);
    expect(deepgram.requests).toHaveLength(0);
  });

  test("two YouTube v2 Markdown files without a page URL become two entries", async () => {
    const text = readFileSync(path.join(FIXTURES, "youtube-default.md"), "utf8");
    const { importV2, library } = setup([
      v2File("2026-03-05-zoo.md", text),
      v2File("2026-03-05-zoo-2.md", text.replace("long trunks.", "long trunks. Fin.")),
    ]);

    await importV2({});

    const keys = (await entriesOf(library)).map((entry) => entry.sourceKey);
    expect(keys).toHaveLength(2);
    expect(keys.every((key) => key.startsWith("v2:"))).toBe(true);
    expect(new Set(keys).size).toBe(2);
  });

  test("Groq's 'Portuguese' is saved as pt", async () => {
    const { importV2, library } = setup([fixture("groq-timestamps.md", "2026-04-10-aula-1.md")]);

    await importV2({});

    expect((await entriesOf(library))[0]).toMatchObject({ provider: "groq", detectedLanguage: "pt" });
  });

  test("a corrupt file is skipped with its reason and the others import", async () => {
    const broken = v2File("2026-01-01-broken.md", "not a transcript\n");
    const { importV2 } = setup([broken, fixture("json-golden.json", "2026-03-02-demo.json")]);

    const result = await importV2({});

    expect(result).toEqual(
      ok({
        ranBefore: false,
        found: 2,
        imported: 1,
        already: 0,
        skipped: [{ file: broken.path, reason: "Not a pi-tube v2 transcript: no frontmatter." }],
      }),
    );
  });

  test("a v2 local_file whose media is gone is keyed v2:<sha>; one whose media exists is keyed file:<sha256>", async () => {
    const media = path.join(root, "aula.mp3");
    writeFileSync(media, "audio-bytes");
    const golden = JSON.parse(readFileSync(path.join(FIXTURES, "json-golden.json"), "utf8"));
    const localJson = (absolutePath: string, text: string): string =>
      JSON.stringify({
        ...golden,
        source: {
          ...golden.source,
          kind: "local_file",
          original_input: absolutePath,
          normalized_url: null,
          media_url: null,
          absolute_path: absolutePath,
        },
        transcript: { ...golden.transcript, full_text: text },
      });
    const present = v2File("2026-03-02-present.json", localJson(media, "present"));
    const gone = v2File("2026-03-02-gone.json", localJson(path.join(root, "gone.mp3"), "gone"));
    const { importV2, library } = setup([present, gone]);

    await importV2({});

    const keys = (await entriesOf(library)).map((entry) => entry.sourceKey).sort();
    expect(keys).toEqual([`file:${sha256("audio-bytes")}`, `v2:${gone.sha256}`].sort());
  });

  test("a file that cannot be read is skipped with its reason and counted, and the others import", async () => {
    const unreadable = [{ path: "/home/me/.pi-tube/2026-03-02-b.md", reason: "Cannot read the file (EACCES)." }];
    const { importV2 } = setup([fixture("json-golden.json", "2026-03-02-a.json")], { unreadable });

    const result = await importV2({});

    expect(result).toEqual(
      ok({
        ranBefore: false,
        found: 2,
        imported: 1,
        already: 0,
        skipped: [{ file: unreadable[0]?.path, reason: unreadable[0]?.reason }],
      }),
    );
  });

  test("without force, a finished import does not run again", async () => {
    const { importV2, filesCalls } = setup(ALL_FIXTURES(), { imported: true });

    const result = await importV2({});

    expect(result).toEqual(ok({ ranBefore: true, found: 0, imported: 0, already: 0, skipped: [] }));
    expect(filesCalls()).toBe(0);
  });

  test("with no v2 files, nothing is written: no library dir and no marker", async () => {
    const { importV2, marked } = setup([]);

    const result = await importV2({});

    expect(result).toEqual(ok({ ranBefore: false, found: 0, imported: 0, already: 0, skipped: [] }));
    expect(marked()).toBeUndefined();
    expect(existsSync(libraryDir)).toBe(false);
  });

  test("the saved transcript keeps the v2 generated_at, and its Markdown name carries that date", async () => {
    const { importV2, library } = setup([fixture("json-golden.json", "2026-03-02-demo.json")]);

    await importV2({});

    const [entry] = await entriesOf(library);
    expect(entry?.generatedAt).toBe("2026-03-02T23:50:00.000Z");
    const stored = await library.get(entry?.transcriptId ?? "");
    expect(path.basename(stored.success && stored.data ? stored.data.paths.markdown : "")).toMatch(
      /^2026-03-02-.+\.md$/,
    );
  });
});
