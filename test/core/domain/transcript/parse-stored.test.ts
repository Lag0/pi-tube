import { describe, expect, test } from "vitest";
import type { ResolvedSource } from "../../../../src/core/domain/source.ts";
import { buildOutputArtifact } from "../../../../src/core/domain/transcript/build-artifact.ts";
import type { OutputArtifact } from "../../../../src/core/domain/transcript/contract.ts";
import { parseStoredArtifact } from "../../../../src/core/domain/transcript/parse-stored.ts";
import { renderJson } from "../../../../src/core/domain/transcript/render-json.ts";

const site: ResolvedSource = {
  kind: "site",
  originalInput: "https://vimeo.com/1",
  normalizedUrl: "https://vimeo.com/1",
  metadata: {
    platform: "Vimeo",
    mediaId: "1",
    title: "Talk",
    durationSeconds: 20,
    chapters: [
      { title: "A", startMs: 0, endMs: 10_000 },
      { title: "B", startMs: 10_000, endMs: 20_000 },
    ],
  },
};
const direct: ResolvedSource = {
  kind: "direct_url",
  originalInput: "https://cdn.example.com/a.mp3",
  normalizedUrl: "https://cdn.example.com/a.mp3",
  mediaUrl: "https://cdn.example.com/a.mp3",
  extension: "mp3",
};

/** As the library saves it: built, then stamped with its id and source key. */
const artifactOf = (source: ResolvedSource): OutputArtifact => {
  const built = buildOutputArtifact(
    {
      source,
      provider: "groq",
      model: "whisper-large-v3",
      transcript: "hello world",
      detectedLanguage: "en",
      segments: [
        { startMs: 1000, endMs: 1500, text: "hello" },
        { startMs: 12_000, endMs: 12_500, text: "world" },
      ],
    },
    { generatedAt: "2026-10-31T00:00:00.000Z", includeTimestamps: true },
  );
  return { ...built, transcript_id: "0123456789abcdef0123", source: { ...built.source, source_key: "vimeo:1" } };
};

describe("parseStoredArtifact", () => {
  test.each([
    ["a site with chapters", site],
    ["a direct URL", direct],
  ])("round-trips %s", (_name, source) => {
    const artifact = artifactOf(source);

    const parsed = parseStoredArtifact(renderJson(artifact));

    expect(parsed).toEqual({ success: true, data: artifact });
  });

  test("the artifact carries the transcript id, source key and model", () => {
    const payload = JSON.parse(renderJson(artifactOf(site)));

    expect(payload.schema_version).toBe("1.3.0");
    expect(payload.transcript_id).toBe("0123456789abcdef0123");
    expect(payload.source.source_key).toBe("vimeo:1");
    expect(payload.transcription.model).toBe("whisper-large-v3");
  });

  test("a 1.2.0 transcript without the new fields is accepted", () => {
    const payload = JSON.parse(renderJson(artifactOf(direct)));
    payload.schema_version = "1.2.0";
    delete payload.transcript_id;
    delete payload.source.source_key;
    delete payload.transcription.model;

    const parsed = parseStoredArtifact(JSON.stringify(payload));

    expect(parsed.success ? parsed.data.transcript.full_text : undefined).toBe("hello world");
  });

  test.each([
    ["{", "Stored transcript is not valid JSON."],
    ['{"schema_version":"1.3.0","transcript":{}}', "Stored transcript is missing `transcript.full_text`."],
  ])("%s is STORAGE_IO_FAILED", (text, message) => {
    const parsed = parseStoredArtifact(text);

    expect(parsed.success ? undefined : parsed.error).toMatchObject({ code: "STORAGE_IO_FAILED", message });
  });
});
