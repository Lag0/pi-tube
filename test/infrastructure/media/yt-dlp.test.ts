import { describe, expect, test } from "vitest";
import { parseYtDlpOutput } from "../../../src/infrastructure/media/yt-dlp.ts";

const VIDEO = {
  url: "https://cdn.example.com/video.mp4",
  ext: "mp4",
  protocol: "https",
  vcodec: "avc1",
  acodec: "none",
};
const AUDIO = {
  url: "https://cdn.example.com/audio.m4a",
  ext: "m4a",
  protocol: "https",
  vcodec: "none",
  acodec: "mp4a.40.2",
};
const STORYBOARD = {
  url: "https://i.ytimg.com/sb/example/storyboard.jpg",
  ext: "jpg",
  protocol: "https",
  format_note: "storyboard",
};
const MHTML = { url: "https://i.ytimg.com/sb/example/board.mhtml", ext: "mp4", protocol: "mhtml" };

const mediaUrlOf = (payload: Record<string, unknown>): string | undefined => {
  const result = parseYtDlpOutput(JSON.stringify(payload), true);
  return result.success ? result.data.mediaUrl : undefined;
};

describe("parseYtDlpOutput", () => {
  test("reads the media URL, title, timestamp date and deduplicated description links", () => {
    const result = parseYtDlpOutput(
      JSON.stringify({
        url: "https://cdn.example.com/video.mp4",
        title: "Example",
        timestamp: 1_700_000_000,
        description:
          "Links: https://example.com/first, https://example.com/second). See https://en.wikipedia.org/wiki/Mercury_(planet) too. Duplicate https://example.com/first",
      }),
      true,
    );

    expect(result.success ? result.data : undefined).toMatchObject({
      mediaUrl: "https://cdn.example.com/video.mp4",
      title: "Example",
      publishedAt: "2023-11-14",
      descriptionLinks: [
        "https://example.com/first",
        "https://example.com/second",
        "https://en.wikipedia.org/wiki/Mercury_(planet)",
      ],
    });
  });

  test("falls back to upload_date when the timestamp is absent", () => {
    const result = parseYtDlpOutput(JSON.stringify({ url: VIDEO.url, upload_date: "20240229" }), true);

    expect(result.success ? result.data.publishedAt : undefined).toBe("2024-02-29");
  });

  test("prefers the audio-only requested format", () => {
    expect(mediaUrlOf({ formats: [STORYBOARD, VIDEO, AUDIO], requested_formats: [VIDEO, AUDIO] })).toBe(AUDIO.url);
  });

  test("skips storyboard, image and mhtml formats", () => {
    expect(mediaUrlOf({ formats: [STORYBOARD, MHTML, VIDEO] })).toBe(VIDEO.url);
  });

  test("output with no usable format URL is YTDLP_OUTPUT_INVALID", () => {
    const result = parseYtDlpOutput(JSON.stringify({ formats: [STORYBOARD, MHTML] }), true);

    expect(result.success ? undefined : result.error.code).toBe("YTDLP_OUTPUT_INVALID");
  });
});
