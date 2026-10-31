import { describe, expect, test } from "vitest";
import type { ResolvedSource } from "../../../../src/core/domain/source.ts";
import { buildOutputArtifact } from "../../../../src/core/domain/transcript/build-artifact.ts";
import { MAX_SLUG_LENGTH, transcriptFileName } from "../../../../src/core/domain/transcript/file-name.ts";

const NOW = new Date(2026, 9, 30, 12, 0, 0);

const artifactWithTitle = (title: string) => {
  const source: ResolvedSource = {
    kind: "youtube",
    originalInput: "https://youtu.be/abc",
    normalizedUrl: "https://www.youtube.com/watch?v=abc",
    mediaUrl: "https://example.com/m.m4a",
    title,
  };
  return buildOutputArtifact({ source, provider: "groq", transcript: "x" });
};

describe("transcriptFileName", () => {
  test("caps a long title at MAX_SLUG_LENGTH without a trailing hyphen", () => {
    const name = transcriptFileName({ artifact: artifactWithTitle("word ".repeat(100)), now: NOW, format: "markdown" });
    const slug = name.slice("2026-10-30-".length, -".md".length);

    expect(MAX_SLUG_LENGTH).toBe(80);
    expect(name.startsWith("2026-10-30-")).toBe(true);
    expect(name.endsWith(".md")).toBe(true);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
  });

  test("a title with no usable characters falls back to transcript", () => {
    expect(transcriptFileName({ artifact: artifactWithTitle("🎬🎬"), now: NOW, format: "json" })).toBe(
      "2026-10-30-transcript.json",
    );
  });

  test("keeps the v2 name for a direct URL", () => {
    const artifact = buildOutputArtifact({
      source: {
        kind: "direct_url",
        originalInput: "https://cdn.example.com/audio/demo.wav",
        normalizedUrl: "https://cdn.example.com/audio/demo.wav",
        mediaUrl: "https://cdn.example.com/audio/demo.wav",
        extension: "wav",
      },
      provider: "deepgram",
      transcript: "x",
    });

    expect(transcriptFileName({ artifact, now: NOW, format: "markdown" })).toBe("2026-10-30-demo.md");
  });
});
