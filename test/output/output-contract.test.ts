import { describe, expect, test } from "bun:test";
import type { TranscriptionExecutionResult } from "../../src/transcription/types.ts";
import { buildOutputArtifact } from "../../src/output/build-artifact.ts";
import { OUTPUT_SCHEMA_VERSION } from "../../src/output/contract.ts";

const baseResult: TranscriptionExecutionResult = {
  source: {
    kind: "direct_url",
    originalInput: "https://cdn.example.com/audio/demo.wav",
    normalizedUrl: "https://cdn.example.com/audio/demo.wav",
    mediaUrl: "https://cdn.example.com/audio/demo.wav",
    extension: "wav",
  },
  provider: "deepgram",
  transcript: "hello world",
  requestedLanguage: "pt-br",
  detectedLanguage: "pt",
};

describe("output contract", () => {
  test("builds canonical output artifact with deterministic top-level keys", () => {
    const artifact = buildOutputArtifact(baseResult, {
      generatedAt: "2026-03-02T23:00:00.000Z",
    });

    expect(artifact.schema_version).toBe(OUTPUT_SCHEMA_VERSION);
    expect(Object.keys(artifact)).toEqual([
      "schema_version",
      "generated_at",
      "source",
      "transcription",
      "summary",
      "transcript",
    ]);
    expect(artifact.generated_at).toBe("2026-03-02T23:00:00.000Z");
    expect(artifact.summary.key_points).toHaveLength(5);
  });

  test("normalizes segment ordering when segment data is available", () => {
    const resultWithSegments = {
      ...baseResult,
      segments: [
        { startMs: 3000, endMs: 3800, text: "segment b" },
        { startMs: 1000, endMs: 1800, text: "segment a" },
      ],
    };

    const artifact = buildOutputArtifact(
      resultWithSegments as TranscriptionExecutionResult & {
        segments: { startMs: number; endMs: number; text: string }[];
      },
      {
        generatedAt: "2026-03-02T23:00:00.000Z",
        includeTimestamps: true,
      },
    );

    expect(artifact.transcript.segments).toEqual([
      { start_ms: 1000, end_ms: 1800, text: "segment a" },
      { start_ms: 3000, end_ms: 3800, text: "segment b" },
    ]);
  });

  test("keeps deterministic fallback shape when segments are absent", () => {
    const artifact = buildOutputArtifact(baseResult, {
      generatedAt: "2026-03-02T23:00:00.000Z",
    });

    expect(artifact.transcript).toEqual({
      full_text: "hello world",
      segments: undefined,
    });
    expect(artifact.summary.key_points[4]).toBe("Timestamp mode: off (use --timestamps)");
  });

  test("compacts dense timestamp streams into readable chunks", () => {
    const denseSegments = Array.from({ length: 500 }, (_unused, index) => {
      const n = index + 1;
      const startMs = n * 200;
      return {
        startMs,
        endMs: startMs + 120,
        text: n % 12 === 0 ? `w${n}.` : `w${n}`,
      };
    });

    const artifact = buildOutputArtifact(
      {
        ...baseResult,
        segments: denseSegments,
      } as TranscriptionExecutionResult & {
        segments: { startMs: number; endMs: number; text: string }[];
      },
      {
        generatedAt: "2026-03-02T23:00:00.000Z",
        includeTimestamps: true,
      },
    );

    const compacted = artifact.transcript.segments ?? [];
    expect(compacted.length).toBeGreaterThan(0);
    expect(compacted.length).toBeLessThan(200);
    expect(compacted[0]?.start_ms).toBe(200);
    expect(compacted[0]?.text.includes(" ")).toBe(true);
    expect(compacted[compacted.length - 1]?.end_ms).toBe(100120);
  });

  test("keeps timestamps disabled by default even when provider segments exist", () => {
    const artifact = buildOutputArtifact(
      {
        ...baseResult,
        segments: [{ startMs: 0, endMs: 600, text: "hello" }],
      } as TranscriptionExecutionResult & {
        segments: { startMs: number; endMs: number; text: string }[];
      },
      {
        generatedAt: "2026-03-02T23:00:00.000Z",
      },
    );

    expect(artifact.transcript.segments).toBeUndefined();
    expect(artifact.summary.key_points[4]).toBe("Timestamp mode: off (use --timestamps)");
  });
});
