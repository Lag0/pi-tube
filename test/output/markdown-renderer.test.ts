import { describe, expect, test } from "bun:test";
import { buildOutputArtifact } from "../../src/output/build-artifact.ts";
import { renderMarkdown } from "../../src/output/markdown.ts";
import type { TranscriptionExecutionResult } from "../../src/transcription/types.ts";

const executionResult: TranscriptionExecutionResult = {
  source: {
    kind: "direct_url",
    originalInput: "https://cdn.example.com/audio/demo.wav",
    normalizedUrl: "https://cdn.example.com/audio/demo.wav",
    mediaUrl: "https://cdn.example.com/audio/demo.wav",
    extension: "wav",
  },
  provider: "deepgram",
  transcript: "hello world",
  requestedLanguage: "en",
  detectedLanguage: "en",
};

describe("markdown renderer", () => {
  test("renders deterministic frontmatter and summary sections", () => {
    const artifact = buildOutputArtifact(executionResult, {
      generatedAt: "2026-03-02T23:30:00.000Z",
    });
    const markdown = renderMarkdown(artifact);

    expect(markdown).toContain("---\nschema_version: \"1.0.0\"");
    expect(markdown).toContain("generated_at: \"2026-03-02T23:30:00.000Z\"");
    expect(markdown).toContain("source_kind: \"direct_url\"");
    expect(markdown).toContain("source_reference: \"https://cdn.example.com/audio/demo.wav\"");
    expect(markdown).toContain("provider: \"deepgram\"");
    expect(markdown).toContain("## Summary");
    expect(markdown).toContain("### Key Points");
    expect(markdown.match(/^- /gm)?.length).toBe(5);
  });

  test("keeps transcript fallback section deterministic", () => {
    const artifact = buildOutputArtifact(executionResult, {
      generatedAt: "2026-03-02T23:30:00.000Z",
    });
    const markdown = renderMarkdown(artifact);

    expect(markdown).toContain("## Transcript");
    expect(markdown).toContain("### Full Text");
    expect(markdown).not.toContain("### Timestamped Segments");
    expect(markdown).toContain("hello world");
  });

  test("renders timestamped transcript lines when segments are available", () => {
    const artifact = buildOutputArtifact(
      {
        ...executionResult,
        segments: [
          { startMs: 1000, endMs: 2200, text: "hello" },
          { startMs: 2300, endMs: 3200, text: "world" },
        ],
      },
      {
        generatedAt: "2026-03-02T23:30:00.000Z",
      },
    );
    const markdown = renderMarkdown(artifact);

    expect(markdown).toContain("### Timestamped Segments");
    expect(markdown).toContain("- [00:00:01.000 - 00:00:02.200] hello");
    expect(markdown).toContain("- [00:00:02.300 - 00:00:03.200] world");
    expect(markdown).toContain("### Full Text");
  });
});
