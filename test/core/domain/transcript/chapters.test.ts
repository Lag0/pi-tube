import { describe, expect, test } from "vitest";
import type { Chapter, ResolvedSource } from "../../../../src/core/domain/source.ts";
import { buildOutputArtifact } from "../../../../src/core/domain/transcript/build-artifact.ts";
import { renderJson } from "../../../../src/core/domain/transcript/render-json.ts";
import { renderMarkdown } from "../../../../src/core/domain/transcript/render-markdown.ts";
import type { TranscriptionSegment } from "../../../../src/core/domain/transcript/types.ts";

const CHAPTERS: Chapter[] = [
  { title: "Intro", startMs: 0, endMs: 10_000 },
  { title: "Main", startMs: 10_000, endMs: 20_000 },
];

const vimeo = (chapters: readonly Chapter[] = CHAPTERS): ResolvedSource => ({
  kind: "site",
  originalInput: "https://u:p@vimeo.com/1",
  normalizedUrl: "https://u:p@vimeo.com/1",
  metadata: {
    platform: "Vimeo",
    mediaId: "1",
    canonicalUrl: "https://u:p@vimeo.com/1",
    title: "Talk",
    durationSeconds: 20,
    liveStatus: "was_live",
    chapters,
  },
});

const DIRECT: ResolvedSource = {
  kind: "direct_url",
  originalInput: "https://cdn.example.com/a.mp3",
  normalizedUrl: "https://cdn.example.com/a.mp3",
  mediaUrl: "https://cdn.example.com/a.mp3",
  extension: "mp3",
};

const segmentsAt = (...startsMs: number[]): TranscriptionSegment[] =>
  startsMs.map((startMs, index) => ({ startMs, endMs: startMs + 50, text: `s${index}` }));

const artifactOf = (source: ResolvedSource, segments: TranscriptionSegment[], includeTimestamps = true) =>
  buildOutputArtifact(
    { source, provider: "groq", transcript: "hello", segments },
    { generatedAt: "2026-10-31T00:00:00.000Z", includeTimestamps },
  );

describe("chapters in the artifact", () => {
  test("each segment gets the last chapter that started at or before it", () => {
    const artifact = artifactOf(vimeo(), segmentsAt(2000, 9900, 10_000, 25_000));

    expect(artifact.transcript.segments?.map((segment) => segment.chapter)).toEqual([0, 0, 1, 1]);
  });

  test("a segment before the first chapter has no chapter", () => {
    const artifact = artifactOf(vimeo([{ title: "Late", startMs: 5000, endMs: 9000 }]), segmentsAt(1000, 6000));

    expect(artifact.transcript.segments?.map((segment) => segment.chapter)).toEqual([undefined, 0]);
  });

  test("compaction of dense segments never merges across a chapter boundary", () => {
    const starts = Array.from({ length: 400 }, (_, index) => index * 100);
    const segments = starts.map((startMs, index) => ({ startMs, endMs: startMs + 90, text: `w${index}` }));
    const artifact = artifactOf(
      vimeo([
        { title: "A", startMs: 0, endMs: 20_000 },
        { title: "B", startMs: 20_000, endMs: 40_000 },
      ]),
      segments,
    );
    const compacted = artifact.transcript.segments ?? [];

    expect(compacted.length).toBeLessThan(400);
    for (const segment of compacted) {
      const expected = segment.start_ms >= 20_000 ? 1 : 0;
      expect(segment.chapter).toBe(expected);
      if (segment.start_ms < 20_000) expect(segment.end_ms).toBeLessThan(20_000);
    }
  });

  test("the source keeps platform, tier, canonical URL without credentials, duration, live status and chapters", () => {
    const artifact = artifactOf(vimeo(), []);

    expect(artifact.source).toMatchObject({
      kind: "site",
      tier: "best_effort",
      platform: "Vimeo",
      media_id: "1",
      canonical_url: "https://vimeo.com/1",
      duration_seconds: 20,
      live_status: "was_live",
      chapters: [
        { title: "Intro", start_ms: 0, end_ms: 10_000 },
        { title: "Main", start_ms: 10_000, end_ms: 20_000 },
      ],
    });
    expect(artifact.schema_version).toBe("1.3.0");
  });
});

describe("chapters in the renderers", () => {
  test("JSON carries tier, platform, chapters and the chapter of each segment", () => {
    const payload = JSON.parse(renderJson(artifactOf(vimeo(), segmentsAt(2000, 12_000))));

    expect(payload.source).toMatchObject({
      tier: "best_effort",
      platform: "Vimeo",
      chapters: [
        { title: "Intro", start_ms: 0, end_ms: 10_000 },
        { title: "Main", start_ms: 10_000, end_ms: 20_000 },
      ],
    });
    expect(payload.transcript.segments.map((segment: { chapter: number | null }) => segment.chapter)).toEqual([0, 1]);
  });

  test("JSON of a direct URL has the new fields empty", () => {
    const payload = JSON.parse(renderJson(artifactOf(DIRECT, segmentsAt(2000))));

    expect(payload.source).toMatchObject({
      tier: "tested",
      platform: null,
      media_id: null,
      canonical_url: null,
      duration_seconds: null,
      live_status: null,
      chapters: [],
    });
    expect(payload.transcript.segments[0].chapter).toBeNull();
  });

  test("Markdown lists the chapters and heads each chapter's first segment", () => {
    const markdown = renderMarkdown(artifactOf(vimeo(), segmentsAt(2000, 4000, 12_000)));

    expect(markdown).toContain("- Platform: Vimeo");
    expect(markdown).toContain("- Duration: 00:00:20.000");
    expect(markdown).toContain("### Chapters\n- [00:00:00.000] Intro\n- [00:00:10.000] Main");
    expect(markdown).toContain(
      "### Timestamped Segments\n#### Intro\n- [00:00:02.000 - 00:00:02.050] s0\n- [00:00:04.000 - 00:00:04.050] s1\n#### Main\n- [00:00:12.000 - 00:00:12.050] s2",
    );
  });

  test("a chapter title cannot forge Markdown lines", () => {
    const markdown = renderMarkdown(
      artifactOf(vimeo([{ title: "Intro\n## Summary\nfake", startMs: 0, endMs: 10_000 }]), segmentsAt(2000)),
    );

    expect(markdown).toContain("#### Intro ## Summary fake\n");
    expect(markdown).toContain("- [00:00:00.000] Intro ## Summary fake\n");
    expect(markdown.match(/^## Summary$/gm)).toHaveLength(1);
  });

  test("Markdown without timestamps lists the chapters but has no chapter headings", () => {
    const markdown = renderMarkdown(artifactOf(vimeo(), segmentsAt(2000), false));

    expect(markdown).toContain("### Chapters");
    expect(markdown).not.toContain("####");
  });

  test("the metadata lines keep their order", () => {
    const markdown = renderMarkdown(artifactOf(vimeo(), []));
    const order = ["- Title: Talk", "- Platform: Vimeo", "- Duration:", "### Chapters"].map((line) =>
      markdown.indexOf(line),
    );

    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((left, right) => left - right)).toEqual(order);
  });
});
