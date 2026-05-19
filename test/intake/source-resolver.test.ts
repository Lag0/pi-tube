import { describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveSource } from "../../src/intake/resolver.ts";
import { CliError } from "../../src/errors/cli-errors.ts";

describe("source resolver", () => {
  test("classifies a YouTube URL through the youtube adapter", async () => {
    const source = await resolveSource("https://www.youtube.com/watch?v=dQw4w9WgXcQ", {
      resolveYouTube: async (input) => ({
        kind: "youtube",
        originalInput: input,
        normalizedUrl: input,
        mediaUrl: "https://cdn.example.com/video.mp4",
        title: "Video",
      }),
    });

    expect(source.kind).toBe("youtube");
    expect(source.mediaUrl).toBe("https://cdn.example.com/video.mp4");
  });

  test("classifies direct media URL by extension", async () => {
    const source = await resolveSource("https://cdn.example.com/audio/sample.mp3");

    expect(source.kind).toBe("direct_url");
    expect(source.extension).toBe("mp3");
    expect(source.mediaUrl).toBe("https://cdn.example.com/audio/sample.mp3");
  });

  test("classifies Instagram public URLs through instagram adapter", async () => {
    const source = await resolveSource("https://www.instagram.com/reel/C0de123", {
      resolveInstagram: async (input) => ({
        kind: "instagram",
        originalInput: input,
        normalizedUrl: input,
        mediaUrl: "https://cdn.example.com/instagram/reel.mp4",
        title: "Instagram Reel",
      }),
    });

    expect(source.kind).toBe("instagram");
    expect(source.mediaUrl).toBe("https://cdn.example.com/instagram/reel.mp4");
  });

  test("rejects unsupported non-direct URL with deterministic policy error", async () => {
    await expect(resolveSource("https://example.com/article")).rejects.toMatchObject({
      code: "UNSUPPORTED_URL_NOT_DIRECT_MEDIA",
    });
  });

  test("falls back to local-file classification for non-URL input", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-resolver-"));
    const filePath = path.join(tempDir, "audio.wav");

    try {
      writeFileSync(filePath, "audio-data");
      const source = await resolveSource(filePath);

      expect(source.kind).toBe("local_file");
      expect(source.absolutePath).toBe(filePath);
      expect(source.extension).toBe("wav");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("surfaces CLI contract error for empty input", async () => {
    await expect(resolveSource("   ")).rejects.toBeInstanceOf(CliError);
  });
});
