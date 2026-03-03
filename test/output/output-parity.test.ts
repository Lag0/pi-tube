import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildOutputArtifact } from "../../src/output/build-artifact.ts";
import { renderJson } from "../../src/output/json.ts";
import { renderMarkdown } from "../../src/output/markdown.ts";
import type { TranscriptionExecutionResult } from "../../src/transcription/types.ts";

function formatTimestamp(milliseconds: number): string {
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const ms = milliseconds % 1000;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

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
  segments: [
    { startMs: 1000, endMs: 1500, text: "hello" },
    { startMs: 1600, endMs: 2400, text: "world" },
  ],
};

const FIXTURE_ROOT = path.join("test", "fixtures", "output");

describe("output parity", () => {
  test("markdown and JSON remain equivalent views of one canonical artifact", () => {
    const artifact = buildOutputArtifact(executionResult, {
      generatedAt: "2026-03-02T23:50:00.000Z",
      includeTimestamps: true,
    });
    const markdown = renderMarkdown(artifact);
    const payload = JSON.parse(renderJson(artifact)) as {
      schema_version: string;
      source: { kind: string; media_url: string | null };
      transcription: { provider: string; requested_language: string | null; detected_language: string | null };
      summary: { key_points: string[] };
      transcript: { full_text: string; segments: Array<{ start_ms: number; end_ms: number; text: string }> };
    };

    expect(payload.schema_version).toBe("1.0.0");
    expect(markdown).toContain(`source_kind: "${payload.source.kind}"`);
    expect(markdown).toContain(`source_reference: "${payload.source.media_url}"`);
    expect(markdown).toContain(`provider: "${payload.transcription.provider}"`);
    expect(markdown).toContain(`requested_language: "${payload.transcription.requested_language}"`);
    expect(markdown).toContain(`detected_language: "${payload.transcription.detected_language}"`);

    for (const point of payload.summary.key_points) {
      expect(markdown).toContain(`- ${point}`);
    }

    expect(markdown).toContain(payload.transcript.full_text);
    for (const segment of payload.transcript.segments) {
      expect(markdown).toContain(
        `- [${formatTimestamp(segment.start_ms)} - ${formatTimestamp(segment.end_ms)}] ${segment.text}`,
      );
    }
  });

  test("golden fixtures preserve semantic parity assumptions", () => {
    const markdownFixture = readFileSync(path.join(FIXTURE_ROOT, "markdown-golden.md"), "utf8");
    const jsonFixture = JSON.parse(
      readFileSync(path.join(FIXTURE_ROOT, "json-golden.json"), "utf8"),
    ) as {
      schema_version: string;
      source: { kind: string; media_url: string | null };
      transcription: { provider: string; requested_language: string | null; detected_language: string | null };
      summary: { key_points: string[] };
      transcript: { full_text: string; segments: Array<{ start_ms: number; end_ms: number; text: string }> };
    };

    expect(markdownFixture).toContain(`schema_version: "${jsonFixture.schema_version}"`);
    expect(markdownFixture).toContain(`source_kind: "${jsonFixture.source.kind}"`);
    expect(markdownFixture).toContain(`source_reference: "${jsonFixture.source.media_url}"`);
    expect(markdownFixture).toContain(`provider: "${jsonFixture.transcription.provider}"`);
    expect(markdownFixture).toContain(
      `requested_language: "${jsonFixture.transcription.requested_language}"`,
    );
    expect(markdownFixture).toContain(
      `detected_language: "${jsonFixture.transcription.detected_language}"`,
    );

    for (const point of jsonFixture.summary.key_points) {
      expect(markdownFixture).toContain(`- ${point}`);
    }

    expect(markdownFixture).toContain(jsonFixture.transcript.full_text);
    for (const segment of jsonFixture.transcript.segments) {
      expect(markdownFixture).toContain(
        `- [${formatTimestamp(segment.start_ms)} - ${formatTimestamp(segment.end_ms)}] ${segment.text}`,
      );
    }
  });
});
