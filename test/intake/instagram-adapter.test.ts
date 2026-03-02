import { describe, expect, test } from "bun:test";
import { resolveInstagramSource } from "../../src/intake/adapters/instagram.ts";
import { resolveInstagramWithYtDlp } from "../../src/intake/tools/yt-dlp.ts";

describe("instagram yt-dlp boundary", () => {
  test("returns parsed media metadata on successful yt-dlp output", async () => {
    const result = await resolveInstagramWithYtDlp(
      "https://www.instagram.com/reel/abc123/",
      async () => ({
        exitCode: 0,
        stdout: JSON.stringify({ url: "https://cdn.example.com/instagram/reel.mp4", title: "Instagram Reel" }),
        stderr: "",
      }),
    );

    expect(result.mediaUrl).toBe("https://cdn.example.com/instagram/reel.mp4");
    expect(result.title).toBe("Instagram Reel");
  });
});

describe("instagram adapter", () => {
  test("returns normalized source for supported public Instagram URLs", async () => {
    const source = await resolveInstagramSource("https://www.instagram.com/reel/abc123", {
      resolveMedia: async () => ({
        mediaUrl: "https://cdn.example.com/instagram/reel.mp4",
        title: "Public Reel",
      }),
    });

    expect(source.kind).toBe("instagram");
    expect(source.mediaUrl).toBe("https://cdn.example.com/instagram/reel.mp4");
    expect(source.title).toBe("Public Reel");
    expect(source.originalInput).toBe("https://www.instagram.com/reel/abc123");
  });

  test("rejects unsupported Instagram URL shapes with deterministic error", async () => {
    await expect(resolveInstagramSource("https://www.instagram.com/explore/")).rejects.toMatchObject({
      code: "INSTAGRAM_URL_INVALID",
    });
  });
});
