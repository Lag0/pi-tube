import { describe, expect, test } from "vitest";
import type { OutputArtifact, OutputArtifactSegment } from "../../../../src/core/domain/transcript/contract.ts";
import {
  MAX_SEGMENT_PAGE,
  MAX_TEXT_PAGE_CHARS,
  pageTranscript,
  type TranscriptReadRequest,
} from "../../../../src/core/domain/transcript/read.ts";

// Segments 0–4 have uneven bounds (0–2000, 2000–4000, 4000–6000, 6000–9000, 9000–12000); 5–29 are one second each.
const BOUNDS = [0, 2000, 4000, 6000, 9000, 12000];
const chapterOf = (index: number): number => (index < 3 ? 0 : index < 5 ? 1 : 2);
const SEGMENTS: OutputArtifactSegment[] = Array.from({ length: 30 }, (_, index) => ({
  start_ms: index < 5 ? (BOUNDS[index] ?? 0) : 12000 + (index - 5) * 1000,
  end_ms: index < 5 ? (BOUNDS[index + 1] ?? 0) : 13000 + (index - 5) * 1000,
  text: `seg-${index}`,
  chapter: chapterOf(index),
}));
const FULL_TEXT = SEGMENTS.map((segment) => segment.text).join(" ");

const artifact = (overrides: { segments?: OutputArtifactSegment[] | undefined; fullText?: string } = {}) =>
  ({
    schema_version: "1.3.0",
    generated_at: "2026-11-02T00:00:00.000Z",
    transcript_id: "0123456789abcdef0123",
    source: {
      kind: "youtube",
      tier: "tested",
      original_input: "https://www.youtube.com/watch?v=abc",
      chapters: [
        { title: "Intro", start_ms: 0, end_ms: 6000 },
        { title: "Middle", start_ms: 6000, end_ms: 12000 },
        { title: "End", start_ms: 12000, end_ms: 37000 },
      ],
    },
    transcription: { provider: "groq" },
    summary: { paragraph: "p", key_points: ["a", "b", "c", "d", "e"] },
    transcript: {
      full_text: overrides.fullText ?? FULL_TEXT,
      ...("segments" in overrides
        ? overrides.segments === undefined
          ? {}
          : { segments: overrides.segments }
        : { segments: SEGMENTS }),
    },
  }) satisfies OutputArtifact;

const request = (overrides: Partial<TranscriptReadRequest> = {}): TranscriptReadRequest => ({
  format: "text",
  offset: 0,
  limit: 20_000,
  ...overrides,
});

const errorOf = (result: ReturnType<typeof pageTranscript>) => (result.success ? undefined : result.error);

describe("pageTranscript: paging and filters", () => {
  test("text pages concatenate to the exact full_text", () => {
    const pages: string[] = [];
    let offset: number | undefined = 0;
    const offsets: number[] = [];
    while (offset !== undefined) {
      const page = pageTranscript(artifact(), request({ offset, limit: 7 }), 100_000);
      if (!page.success) throw new Error(page.error.message);
      offsets.push(offset);
      pages.push(page.data.text ?? "");
      expect(page.data.total).toBe(FULL_TEXT.length);
      offset = page.data.nextOffset;
    }

    expect(pages.join("")).toBe(FULL_TEXT);
    expect(offsets.every((value, index) => value === index * 7)).toBe(true);
    expect(pages.at(-1)?.length).toBeLessThanOrEqual(7);
  });

  test("segments pages by segment count", () => {
    const first = pageTranscript(artifact(), request({ format: "segments", limit: 12 }), 100_000);
    const last = pageTranscript(artifact(), request({ format: "segments", offset: 24, limit: 12 }), 100_000);

    expect(first.success && first.data.segments?.map((segment) => segment.text)).toEqual(
      SEGMENTS.slice(0, 12).map((segment) => segment.text),
    );
    expect(first.success && first.data).toMatchObject({ total: 30, nextOffset: 12, truncated: false });
    expect(last.success && last.data.segments).toHaveLength(6);
    expect(last.success && last.data.nextOffset).toBeUndefined();
  });

  test("a time range keeps the segments that overlap it", () => {
    const text = pageTranscript(artifact(), request({ fromMs: 5000, toMs: 9000 }), 100_000);
    const segments = pageTranscript(
      artifact(),
      request({ format: "segments", limit: 100, fromMs: 5000, toMs: 9000 }),
      100_000,
    );

    expect(text.success && text.data.text).toBe("seg-2 seg-3");
    expect(segments.success && segments.data.segments?.map((segment) => [segment.start_ms, segment.end_ms])).toEqual([
      [4000, 6000],
      [6000, 9000],
    ]);
  });

  test("a chapter keeps its segments", () => {
    const page = pageTranscript(artifact(), request({ chapter: 1 }), 100_000);

    expect(page.success && page.data).toMatchObject({ text: "seg-3 seg-4", total: "seg-3 seg-4".length });
    expect(page.success && page.data.chapters.map((chapter) => chapter.title)).toEqual(["Intro", "Middle", "End"]);
  });

  test("a chapter that does not exist is INPUT_INVALID", () => {
    expect(errorOf(pageTranscript(artifact(), request({ chapter: 3 }), 100_000))).toMatchObject({
      code: "INPUT_INVALID",
      message: "Chapter 3 does not exist; this transcript has 3 chapters (0 to 2).",
    });
  });
});

describe("pageTranscript: no segments", () => {
  const plain = artifact({ segments: undefined, fullText: "just text" });

  test.each([{ fromMs: 0 }, { toMs: 1000 }, { chapter: 0 }])("a filter (%j) is INPUT_INVALID", (filter) => {
    expect(errorOf(pageTranscript(plain, request(filter), 100_000))).toMatchObject({
      code: "INPUT_INVALID",
      message: "This transcript has no timed segments, so it cannot be filtered by time or chapter.",
    });
  });

  test("format segments is INPUT_INVALID", () => {
    expect(errorOf(pageTranscript(plain, request({ format: "segments", limit: 10 }), 100_000))).toMatchObject({
      code: "INPUT_INVALID",
      message: "This transcript has no timed segments; read it with format text.",
    });
  });

  test("text still pages", () => {
    const page = pageTranscript(plain, request(), 100_000);

    expect(page.success && page.data).toMatchObject({ text: "just text", total: 9, truncated: false });
  });
});

describe("pageTranscript: full", () => {
  test("under the cap it is the whole text, not truncated", () => {
    const page = pageTranscript(artifact(), request({ full: true, limit: 1 }), 100_000);

    expect(page.success && page.data).toMatchObject({ text: FULL_TEXT, truncated: false });
    expect(page.success && page.data.nextOffset).toBeUndefined();
  });

  test("exactly at the cap it is the whole text, not truncated", () => {
    const page = pageTranscript(artifact(), request({ full: true }), FULL_TEXT.length);

    expect(page.success && page.data).toMatchObject({ text: FULL_TEXT, truncated: false });
    expect(page.success && page.data.nextOffset).toBeUndefined();
  });

  test("over the cap it stops at maxFullChars and says where to go on", () => {
    const page = pageTranscript(artifact(), request({ full: true }), 10);

    expect(page.success && page.data).toMatchObject({
      text: FULL_TEXT.slice(0, 10),
      truncated: true,
      nextOffset: 10,
      total: FULL_TEXT.length,
    });
  });

  test("with segments it stops before the segment whose text would pass the cap", () => {
    // seg-0 … seg-9 are 5 characters each.
    const page = pageTranscript(artifact(), request({ format: "segments", full: true }), 12);

    expect(page.success && page.data.segments?.map((segment) => segment.text)).toEqual(["seg-0", "seg-1"]);
    expect(page.success && page.data).toMatchObject({ truncated: true, nextOffset: 2, total: 30 });
  });
});

describe("pageTranscript: surrogate pairs", () => {
  // "😀" is two UTF-16 units; a page boundary inside it would put a lone surrogate on the wire.
  const emoji = artifact({ segments: undefined, fullText: "ab😀cd" });

  test("a page never ends between the two halves of a character, and pages still concatenate", () => {
    const pages: string[] = [];
    let offset: number | undefined = 0;
    while (offset !== undefined) {
      const page = pageTranscript(emoji, request({ offset, limit: 3 }), 100_000);
      if (!page.success) throw new Error(page.error.message);
      pages.push(page.data.text ?? "");
      offset = page.data.nextOffset;
    }

    expect(pages).toEqual(["ab", "😀c", "d"]);
    expect(pages.join("")).toBe("ab😀cd");
  });

  test("a one-unit page on a surrogate pair takes the whole character, so paging advances", () => {
    const page = pageTranscript(emoji, request({ offset: 2, limit: 1 }), 100_000);

    expect(page.success && page.data).toMatchObject({ text: "😀", nextOffset: 4 });
  });

  test("full stops before a pair the cap would split", () => {
    const page = pageTranscript(emoji, request({ full: true }), 3);

    expect(page.success && page.data).toMatchObject({ text: "ab", truncated: true, nextOffset: 2 });
  });
});

describe("pageTranscript: limits", () => {
  test.each([
    ["limit 0", request({ limit: 0 })],
    [`text limit ${MAX_TEXT_PAGE_CHARS + 1}`, request({ limit: MAX_TEXT_PAGE_CHARS + 1 })],
    [`segments limit ${MAX_SEGMENT_PAGE + 1}`, request({ format: "segments", limit: MAX_SEGMENT_PAGE + 1 })],
    ["offset -1", request({ offset: -1 })],
    ["from_ms equal to to_ms", request({ fromMs: 5000, toMs: 5000 })],
    ["from_ms after to_ms", request({ fromMs: 6000, toMs: 5000 })],
  ])("%s is INPUT_INVALID", (_label, read) => {
    expect(errorOf(pageTranscript(artifact(), read, 100_000))?.code).toBe("INPUT_INVALID");
  });

  test("the maximum limits are accepted", () => {
    expect(pageTranscript(artifact(), request({ limit: MAX_TEXT_PAGE_CHARS }), 100_000).success).toBe(true);
    expect(pageTranscript(artifact(), request({ format: "segments", limit: MAX_SEGMENT_PAGE }), 100_000).success).toBe(
      true,
    );
  });

  test("an offset equal to total is an empty page", () => {
    const page = pageTranscript(artifact(), request({ offset: FULL_TEXT.length }), 100_000);

    expect(page.success && page.data).toMatchObject({ text: "", total: FULL_TEXT.length, truncated: false });
    expect(page.success && page.data.nextOffset).toBeUndefined();
  });
});
