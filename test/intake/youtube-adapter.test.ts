import { describe, expect, test } from "bun:test";
import { resolveYouTubeSource } from "../../src/intake/adapters/youtube.ts";
import { resolveYouTubeWithYtDlp } from "../../src/intake/tools/yt-dlp.ts";
import {
  createYtDlpNotFoundError,
  createYouTubeExtractFailedError,
} from "../../src/errors/cli-errors.ts";

describe("yt-dlp boundary", () => {
  test("returns parsed media metadata on successful yt-dlp output", async () => {
    const result = await resolveYouTubeWithYtDlp(
      "https://youtube.com/watch?v=dQw4w9WgXcQ",
      async () => ({
        exitCode: 0,
        stdout: JSON.stringify({ url: "https://cdn.example.com/video.mp4", title: "Example" }),
        stderr: "",
      }),
    );

    expect(result.mediaUrl).toBe("https://cdn.example.com/video.mp4");
    expect(result.title).toBe("Example");
  });
});

describe("youtube adapter", () => {
  test("returns normalized source on successful yt-dlp extraction", async () => {
    const source = await resolveYouTubeSource("https://youtube.com/watch?v=abc123", {
      resolveMedia: async () => ({
        mediaUrl: "https://cdn.example.com/video.mp4",
        title: "Demo Video",
      }),
    });

    expect(source.kind).toBe("youtube");
    expect(source.mediaUrl).toBe("https://cdn.example.com/video.mp4");
    expect(source.title).toBe("Demo Video");
    expect(source.originalInput).toBe("https://youtube.com/watch?v=abc123");
  });

  test("maps missing yt-dlp binary to deterministic error code", async () => {
    await expect(
      resolveYouTubeSource("https://youtube.com/watch?v=abc123", {
        resolveMedia: async () => {
          throw createYtDlpNotFoundError();
        },
      }),
    ).rejects.toMatchObject({
      code: "YTDLP_NOT_FOUND",
    });
  });

  test("maps yt-dlp extraction failure to deterministic error code", async () => {
    await expect(
      resolveYouTubeSource("https://youtube.com/watch?v=abc123", {
        resolveMedia: async () => {
          throw createYouTubeExtractFailedError("network failure");
        },
      }),
    ).rejects.toMatchObject({
      code: "YOUTUBE_EXTRACT_FAILED",
    });
  });
});
