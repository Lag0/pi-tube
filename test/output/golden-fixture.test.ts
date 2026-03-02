import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildOutputArtifact } from "../../src/output/build-artifact.ts";
import { renderJson } from "../../src/output/json.ts";
import { renderMarkdown } from "../../src/output/markdown.ts";
import type { TranscriptionExecutionResult } from "../../src/transcription/types.ts";

const FIXTURE_GENERATED_AT = "2026-03-02T23:50:00.000Z";
const FIXTURE_ROOT = path.join("test", "fixtures", "output");

const canonicalExecutionResult: TranscriptionExecutionResult = {
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

function renderCanonicalArtifact(): { markdown: string; json: string } {
  const artifact = buildOutputArtifact(canonicalExecutionResult, {
    generatedAt: FIXTURE_GENERATED_AT,
  });

  return {
    markdown: renderMarkdown(artifact),
    json: renderJson(artifact),
  };
}

describe("golden output fixtures", () => {
  test("markdown renderer stays in sync with committed golden fixture", () => {
    const { markdown } = renderCanonicalArtifact();
    const fixture = readFileSync(path.join(FIXTURE_ROOT, "markdown-golden.md"), "utf8").trimEnd();
    expect(markdown).toBe(fixture);
  });

  test("json renderer stays in sync with committed golden fixture", () => {
    const { json } = renderCanonicalArtifact();
    const fixture = readFileSync(path.join(FIXTURE_ROOT, "json-golden.json"), "utf8").trimEnd();
    expect(json).toBe(fixture);
  });
});
