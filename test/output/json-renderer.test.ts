import { describe, expect, test } from "vitest";
import { buildOutputArtifact } from "../../src/output/build-artifact.ts";
import { renderJson } from "../../src/output/json.ts";
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

describe("json renderer", () => {
  test("renders deterministic schema-versioned JSON output", () => {
    const artifact = buildOutputArtifact(executionResult, {
      generatedAt: "2026-03-02T23:40:00.000Z",
    });
    const payload = JSON.parse(renderJson(artifact)) as Record<string, unknown>;

    expect(payload.schema_version).toBe("1.1.0");
    expect(payload.generated_at).toBe("2026-03-02T23:40:00.000Z");
    expect(Object.keys(payload)).toEqual([
      "schema_version",
      "generated_at",
      "source",
      "transcription",
      "summary",
      "transcript",
    ]);
  });

  test("uses deterministic null/empty defaults for optional fields", () => {
    const artifact = buildOutputArtifact(
      {
        ...executionResult,
        requestedLanguage: undefined,
        detectedLanguage: undefined,
      },
      { generatedAt: "2026-03-02T23:40:00.000Z" },
    );
    const payload = JSON.parse(renderJson(artifact)) as {
      source: { published_at: string | null; description: string | null; description_links: string[] };
      transcription: { requested_language: string | null; detected_language: string | null };
      transcript: { segments: unknown[] };
    };

    expect(payload.source.published_at).toBeNull();
    expect(payload.source.description).toBeNull();
    expect(payload.source.description_links).toEqual([]);
    expect(payload.transcription.requested_language).toBeNull();
    expect(payload.transcription.detected_language).toBeNull();
    expect(payload.transcript.segments).toEqual([]);
  });

  test("renders YouTube metadata fields in source payload", () => {
    const artifact = buildOutputArtifact(
      {
        ...executionResult,
        source: {
          kind: "youtube",
          originalInput: "https://youtube.com/watch?v=abc123",
          normalizedUrl: "https://youtube.com/watch?v=abc123",
          mediaUrl: "https://cdn.example.com/audio.m4a",
          title: "Launch Video",
          publishedAt: "2024-02-29",
          description: "Launch notes: https://example.com/notes",
          descriptionLinks: ["https://example.com/notes"],
        },
      },
      { generatedAt: "2026-03-02T23:40:00.000Z" },
    );
    const payload = JSON.parse(renderJson(artifact)) as {
      source: { published_at: string | null; description: string | null; description_links: string[] };
    };

    expect(payload.source.published_at).toBe("2024-02-29");
    expect(payload.source.description).toBe("Launch notes: https://example.com/notes");
    expect(payload.source.description_links).toEqual(["https://example.com/notes"]);
  });
});
