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

    expect(payload.schema_version).toBe("1.0.0");
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
      transcription: { requested_language: string | null; detected_language: string | null };
      transcript: { segments: unknown[] };
    };

    expect(payload.transcription.requested_language).toBeNull();
    expect(payload.transcription.detected_language).toBeNull();
    expect(payload.transcript.segments).toEqual([]);
  });
});
