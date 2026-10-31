import { describe, expect, test } from "vitest";
import type { ResolvedSource } from "../../../../src/core/domain/source.ts";
import { buildOutputArtifact, toPersistedUrl } from "../../../../src/core/domain/transcript/build-artifact.ts";
import { renderJson } from "../../../../src/core/domain/transcript/render-json.ts";
import { renderMarkdown } from "../../../../src/core/domain/transcript/render-markdown.ts";

const artifactFor = (source: ResolvedSource) =>
  buildOutputArtifact(
    { source, provider: "deepgram", transcript: "hello world" },
    { generatedAt: "2026-10-30T00:00:00.000Z" },
  );

describe("persisted URLs", () => {
  test("a YouTube transcript never stores the signed media URL", () => {
    const artifact = artifactFor({
      kind: "youtube",
      originalInput: "https://youtu.be/abc",
      normalizedUrl: "https://www.youtube.com/watch?v=abc",
      mediaUrl: "https://rr1.googlevideo.com/videoplayback?expire=1&sig=abc",
      title: "Demo",
    });

    expect(artifact.source.media_url).toBeUndefined();
    expect(JSON.parse(renderJson(artifact)).source.media_url).toBeNull();
    const markdown = renderMarkdown(artifact);
    expect(markdown).toContain('source_reference: "https://www.youtube.com/watch?v=abc"');
    expect(markdown).not.toMatch(/googlevideo|sig=/);
    expect(renderJson(artifact)).not.toMatch(/googlevideo|sig=/);
  });

  test("an Instagram transcript never stores the signed media URL", () => {
    const artifact = artifactFor({
      kind: "instagram",
      originalInput: "https://www.instagram.com/reel/abc/",
      normalizedUrl: "https://www.instagram.com/reel/abc/",
      mediaUrl: "https://scontent.cdninstagram.com/v/t.mp4?oh=token&oe=1",
    });

    expect(artifact.source.media_url).toBeUndefined();
    expect(renderMarkdown(artifact)).not.toContain("cdninstagram");
  });

  test("a direct URL loses its query and fragment everywhere", () => {
    const signed = "https://cdn.example.com/a.mp3?X-Amz-Signature=s#t";
    const artifact = artifactFor({
      kind: "direct_url",
      originalInput: signed,
      normalizedUrl: signed,
      mediaUrl: signed,
      extension: "mp3",
    });

    expect(artifact.source).toMatchObject({
      original_input: "https://cdn.example.com/a.mp3",
      normalized_url: "https://cdn.example.com/a.mp3",
      media_url: "https://cdn.example.com/a.mp3",
    });
    expect(renderJson(artifact) + renderMarkdown(artifact)).not.toContain("Signature");
  });

  test("a local file is unchanged", () => {
    const artifact = artifactFor({
      kind: "local_file",
      originalInput: "./a.mp3",
      absolutePath: "/tmp/a.mp3",
      extension: "mp3",
    });

    expect(artifact.source).toMatchObject({ original_input: "./a.mp3", absolute_path: "/tmp/a.mp3" });
  });

  test("toPersistedUrl leaves a non-URL string as is", () => {
    expect(toPersistedUrl("not a url")).toBe("not a url");
  });
});

describe("URL credentials", () => {
  test("user:password@ never reaches a saved transcript", () => {
    const withCredentials = "https://alice:s3cret@cdn.example.com/a.mp3?sig=1";
    const direct = artifactFor({
      kind: "direct_url",
      originalInput: withCredentials,
      normalizedUrl: withCredentials,
      mediaUrl: withCredentials,
      extension: "mp3",
    });
    const youtube = artifactFor({
      kind: "youtube",
      originalInput: "https://bob:pw@www.youtube.com/watch?v=abc",
      normalizedUrl: "https://bob:pw@www.youtube.com/watch?v=abc",
      mediaUrl: "https://rr1.googlevideo.com/videoplayback?sig=abc",
    });

    for (const artifact of [direct, youtube]) {
      expect(renderJson(artifact) + renderMarkdown(artifact)).not.toMatch(/s3cret|alice|bob:pw/);
    }
    expect(youtube.source.normalized_url).toBe("https://www.youtube.com/watch?v=abc");
  });
});
