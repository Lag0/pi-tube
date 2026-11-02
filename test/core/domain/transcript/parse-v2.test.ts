import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  parseV2Transcript,
  V2_FILE_NAME,
  V2_MODELS,
  type V2Transcript,
  v2SourceOf,
} from "../../../../src/core/domain/transcript/parse-v2.ts";

const FIXTURES = path.join("test", "fixtures", "v2");

const parsed = (name: string): V2Transcript => {
  const result = parseV2Transcript(name, readFileSync(path.join(FIXTURES, name), "utf8"));
  if (!result.success) throw new Error(result.error.message);
  return result.data;
};

const GOLDEN_SEGMENTS = [
  { startMs: 1000, endMs: 1500, text: "hello" },
  { startMs: 1600, endMs: 2400, text: "world" },
];

describe("parseV2Transcript", () => {
  test("reads the v2 golden JSON", () => {
    expect(parsed("json-golden.json")).toMatchObject({
      generatedAt: "2026-03-02T23:50:00.000Z",
      kind: "direct_url",
      provider: "deepgram",
      requestedLanguage: "en",
      detectedLanguage: "en",
      fullText: "hello world",
      segments: GOLDEN_SEGMENTS,
    });
  });

  test("the v2 golden Markdown reads as the same transcript as the golden JSON", () => {
    const json = parsed("json-golden.json");
    const markdown = parsed("markdown-golden.md");

    for (const field of [
      "generatedAt",
      "kind",
      "provider",
      "requestedLanguage",
      "detectedLanguage",
      "fullText",
      "segments",
      "reference",
    ] as const) {
      expect(markdown[field]).toEqual(json[field]);
    }
  });

  test("a default v2 YouTube Markdown has its metadata and no segments", () => {
    const transcript = parsed("youtube-default.md");

    expect(transcript).toMatchObject({ kind: "youtube", title: "Me at the zoo", publishedAt: "2005-04-24" });
    expect(transcript.segments).toEqual([]);
    expect(transcript.fullText).toMatch(/^All right, so here we are.*long trunks\.$/);
  });

  test("a Groq Markdown with timestamps has both segments and keeps the language as written", () => {
    const transcript = parsed("groq-timestamps.md");

    expect(transcript.provider).toBe("groq");
    expect(transcript.detectedLanguage).toBe("Portuguese");
    expect(transcript.segments).toEqual([
      { startMs: 0, endMs: 2500, text: "Bom dia a todos." },
      { startMs: 2500, endMs: 5250, text: "Hoje falamos de ação penal." },
    ]);
  });

  test.each([
    ["a JSON of a later schema", "x.json", JSON.stringify({ schema_version: "1.3.0" })],
    ["random text", "x.md", "just some notes\n"],
    [
      "a Markdown without a Full Text section",
      "x.md",
      readFileSync(path.join(FIXTURES, "markdown-golden.md"), "utf8").replace("### Full Text", "### Text"),
    ],
    [
      "an unknown provider",
      "x.json",
      readFileSync(path.join(FIXTURES, "json-golden.json"), "utf8").replace('"deepgram"', '"openai"'),
    ],
  ])("%s is refused with a reason", (_name, fileName, raw) => {
    const result = parseV2Transcript(fileName, raw);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe("STORAGE_IO_FAILED");
    expect(result.error.message).toMatch(/^Not a pi-tube v2 transcript: .+\.$/);
  });
});

describe("v2SourceOf", () => {
  test("a v2 YouTube Markdown has no key, and its signed CDN URL is cut to origin and path", () => {
    const { source, keyFromSource } = v2SourceOf(parsed("youtube-default.md"));

    expect(keyFromSource).toBe(false);
    expect(source).toMatchObject({
      kind: "youtube",
      originalInput: "https://rr3---sn-abc.googlevideo.com/videoplayback",
      normalizedUrl: "https://rr3---sn-abc.googlevideo.com/videoplayback",
      metadata: { platform: "Youtube", title: "Me at the zoo", publishedAt: "2005-04-24" },
    });
    expect(JSON.stringify(source)).not.toMatch(/signature|expire/);
  });

  test("a v2 YouTube JSON with the watch URL keys by the video id and drops the signed media URL", () => {
    const { source, keyFromSource } = v2SourceOf(parsed("youtube-watch.json"));

    expect(keyFromSource).toBe(true);
    expect(source).toMatchObject({
      kind: "youtube",
      originalInput: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
      metadata: {
        platform: "Youtube",
        mediaId: "jNQXAC9IVRw",
        title: "Me at the zoo",
        description: "The first video on YouTube.",
        descriptionLinks: ["https://www.youtube.com/@jawed"],
      },
    });
    expect(JSON.stringify(source)).not.toContain("googlevideo");
  });

  test("a direct URL keeps its URL and extension", () => {
    expect(v2SourceOf(parsed("json-golden.json"))).toEqual({
      source: {
        kind: "direct_url",
        originalInput: "https://cdn.example.com/audio/demo.wav",
        normalizedUrl: "https://cdn.example.com/audio/demo.wav",
        mediaUrl: "https://cdn.example.com/audio/demo.wav",
        extension: "wav",
      },
      keyFromSource: true,
    });
  });

  test("a local file keeps its path, with size 0", () => {
    const transcript: V2Transcript = {
      ...parsed("json-golden.json"),
      kind: "local_file",
      originalInput: "./aula.MP4",
      absolutePath: "/Users/me/aula.MP4",
      reference: "/Users/me/aula.MP4",
    };

    expect(v2SourceOf(transcript)).toEqual({
      source: {
        kind: "local_file",
        originalInput: "./aula.MP4",
        absolutePath: "/Users/me/aula.MP4",
        extension: "mp4",
        sizeBytes: 0,
      },
      keyFromSource: true,
    });
  });
});

describe("V2_FILE_NAME and V2_MODELS", () => {
  test.each(["2026-03-02-demo.md", "2026-03-02-demo-2.json"])("%s is a v2 file name", (name) => {
    expect(V2_FILE_NAME.test(name)).toBe(true);
  });

  test.each(["config.json", "2026-03-02.md", "2026-03-02-demo.txt"])("%s is not", (name) => {
    expect(V2_FILE_NAME.test(name)).toBe(false);
  });

  test("the v2 models are the ones v3 calls", () => {
    expect(V2_MODELS).toEqual({ deepgram: "nova-3", groq: "whisper-large-v3", elevenlabs: "scribe_v2" });
  });
});
