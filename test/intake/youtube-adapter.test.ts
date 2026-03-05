import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
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

  test("prefers playable audio URL when yt-dlp payload includes storyboard/image formats", async () => {
    const input = "https://youtube.com/watch?v=dQw4w9WgXcQ";
    let receivedArgs: string[] = [];

    const result = await resolveYouTubeWithYtDlp(input, async (args) => {
      receivedArgs = args;
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          title: "Example",
          formats: [
            {
              url: "https://i.ytimg.com/sb/example/storyboard.jpg",
              ext: "jpg",
              protocol: "mhtml",
              format_note: "storyboard",
            },
            {
              url: "https://cdn.example.com/video.mp4",
              ext: "mp4",
              protocol: "https",
              vcodec: "avc1",
              acodec: "none",
            },
            {
              url: "https://cdn.example.com/audio.m4a",
              ext: "m4a",
              protocol: "https",
              vcodec: "none",
              acodec: "mp4a.40.2",
            },
          ],
          requested_formats: [
            {
              url: "https://cdn.example.com/video.mp4",
              ext: "mp4",
              protocol: "https",
              vcodec: "avc1",
              acodec: "none",
            },
            {
              url: "https://cdn.example.com/audio.m4a",
              ext: "m4a",
              protocol: "https",
              vcodec: "none",
              acodec: "mp4a.40.2",
            },
          ],
        }),
        stderr: "",
      };
    });

    expect(receivedArgs).toEqual([
      "--no-warnings",
      "--no-playlist",
      "--dump-single-json",
      "-f",
      "bestaudio[ext=m4a]/bestaudio/best",
      input,
    ]);
    expect(result.mediaUrl).toBe("https://cdn.example.com/audio.m4a");
    expect(result.title).toBe("Example");
  });

  test("fails fast when yt-dlp process hangs", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "pi-tube-ytdlp-timeout-"));
    const mockYtDlpPath = path.join(tempDir, "yt-dlp");
    writeFileSync(mockYtDlpPath, "#!/usr/bin/env bash\nsleep 60\n");
    chmodSync(mockYtDlpPath, 0o755);

    const originalPath = process.env.PATH;
    const originalTimeout = process.env.PI_TUBE_YTDLP_TIMEOUT_MS;
    process.env.PATH = `${tempDir}:${originalPath ?? ""}`;
    process.env.PI_TUBE_YTDLP_TIMEOUT_MS = "20";

    try {
      await expect(resolveYouTubeWithYtDlp("https://youtube.com/watch?v=dQw4w9WgXcQ")).rejects.toMatchObject({
        code: "YOUTUBE_EXTRACT_FAILED",
      });
    } finally {
      if (originalPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = originalPath;
      }

      if (originalTimeout === undefined) {
        delete process.env.PI_TUBE_YTDLP_TIMEOUT_MS;
      } else {
        process.env.PI_TUBE_YTDLP_TIMEOUT_MS = originalTimeout;
      }

      rmSync(tempDir, { recursive: true, force: true });
    }
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
