import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveSource } from "../../src/intake/resolver.ts";
import { resolveYouTubeSource } from "../../src/intake/adapters/youtube.ts";

describe("intake source matrix", () => {
  test("resolves valid YouTube URL through resolver boundary", async () => {
    const source = await resolveSource("https://www.youtube.com/watch?v=abc123", {
      resolveYouTube: (input) =>
        resolveYouTubeSource(input, {
          resolveMedia: async () => ({ mediaUrl: "https://cdn.example.com/video.mp4", title: "YouTube Video" }),
        }),
    });

    expect(source.kind).toBe("youtube");
    expect(source.mediaUrl).toBe("https://cdn.example.com/video.mp4");
  });

  test("resolves valid direct media URL", async () => {
    const source = await resolveSource("https://cdn.example.com/audio/sample.m4a");

    expect(source.kind).toBe("direct_url");
    expect(source.extension).toBe("m4a");
  });

  test("fails unsupported non-direct URL with deterministic error code", async () => {
    await expect(resolveSource("https://example.com/news/article")).rejects.toMatchObject({
      code: "UNSUPPORTED_URL_NOT_DIRECT_MEDIA",
    });
  });

  test("resolves valid local file path", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-matrix-"));
    const filePath = path.join(tempDir, "clip.mp3");

    try {
      writeFileSync(filePath, "audio-data");
      const source = await resolveSource(filePath);

      expect(source.kind).toBe("local_file");
      expect(source.absolutePath).toBe(filePath);
      expect(source.extension).toBe("mp3");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
