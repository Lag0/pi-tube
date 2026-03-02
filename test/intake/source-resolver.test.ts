import { describe, expect, test } from "bun:test";
import { resolveSource } from "../../src/intake/resolver.ts";
import { CliError } from "../../src/errors/cli-errors.ts";

describe("source resolver", () => {
  test("classifies a YouTube URL through the youtube adapter", async () => {
    const source = await resolveSource("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    expect(source.kind).toBe("youtube");
    expect(source.normalizedUrl).toContain("youtube.com/watch");
  });

  test("classifies direct media URL by extension", async () => {
    const source = await resolveSource("https://cdn.example.com/audio/sample.mp3");

    expect(source.kind).toBe("direct_url");
    expect(source.extension).toBe("mp3");
    expect(source.mediaUrl).toBe("https://cdn.example.com/audio/sample.mp3");
  });

  test("rejects unsupported non-direct URL with deterministic policy error", async () => {
    await expect(resolveSource("https://example.com/article")).rejects.toMatchObject({
      code: "UNSUPPORTED_URL_NOT_DIRECT_MEDIA",
    });
  });

  test("falls back to local-file classification for non-URL input", async () => {
    const source = await resolveSource("./fixtures/audio.wav");

    expect(source.kind).toBe("local_file");
    expect(source.absolutePath).toContain("fixtures/audio.wav");
    expect(source.extension).toBe("wav");
  });

  test("surfaces CLI contract error for empty input", async () => {
    await expect(resolveSource("   ")).rejects.toBeInstanceOf(CliError);
  });
});
