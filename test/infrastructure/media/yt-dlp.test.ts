import { describe, expect, test } from "vitest";
import { interpretYtDlpRun, parseYtDlpInfo } from "../../../src/infrastructure/media/yt-dlp.ts";
import type { ProcessResult } from "../../../src/infrastructure/process/run-process.ts";

const metadataOf = (payload: unknown) => {
  const result = parseYtDlpInfo(JSON.stringify(payload), "https://example.com/v");
  if (!result.success) throw new Error(`parse failed: ${result.error.message}`);
  return result.data;
};

describe("parseYtDlpInfo", () => {
  test("reads the title, timestamp date and deduplicated description links", () => {
    expect(
      metadataOf({
        extractor_key: "Youtube",
        title: "Example",
        timestamp: 1_700_000_000,
        description:
          "Links: https://example.com/first, https://example.com/second). See https://en.wikipedia.org/wiki/Mercury_(planet) too. Duplicate https://example.com/first",
      }),
    ).toMatchObject({
      platform: "Youtube",
      title: "Example",
      publishedAt: "2023-11-14",
      descriptionLinks: [
        "https://example.com/first",
        "https://example.com/second",
        "https://en.wikipedia.org/wiki/Mercury_(planet)",
      ],
    });
  });

  test("falls back to upload_date when the timestamps are absent", () => {
    expect(metadataOf({ upload_date: "20240229" }).publishedAt).toBe("2024-02-29");
  });

  test("uses release_timestamp before upload_date, and release_date last", () => {
    expect(metadataOf({ release_timestamp: 1_700_000_000, upload_date: "20240229" }).publishedAt).toBe("2023-11-14");
    expect(metadataOf({ release_date: "20240301" }).publishedAt).toBe("2024-03-01");
  });

  test("output without formats or a media URL still resolves", () => {
    expect(metadataOf({ id: "abc", extractor_key: "Youtube", title: "No formats" })).toEqual({
      platform: "Youtube",
      mediaId: "abc",
      title: "No formats",
    });
  });

  test("platform falls back to extractor, then to unknown", () => {
    expect(metadataOf({ extractor: "vimeo" }).platform).toBe("vimeo");
    expect(metadataOf({}).platform).toBe("unknown");
  });

  test("keeps only an http(s) webpage_url as the canonical URL", () => {
    expect(metadataOf({ webpage_url: "https://www.youtube.com/watch?v=abc" }).canonicalUrl).toBe(
      "https://www.youtube.com/watch?v=abc",
    );
    expect(metadataOf({ webpage_url: "ftp://example.com/a" }).canonicalUrl).toBeUndefined();
  });

  test("rounds the duration and ignores a non-positive one", () => {
    expect(metadataOf({ duration: 19.4 }).durationSeconds).toBe(19);
    expect(metadataOf({ duration: 0 }).durationSeconds).toBeUndefined();
  });

  test("reads live_status, and derives it from is_live or was_live when absent", () => {
    expect(metadataOf({ live_status: "is_upcoming" }).liveStatus).toBe("is_upcoming");
    expect(metadataOf({ is_live: true }).liveStatus).toBe("is_live");
    expect(metadataOf({ was_live: true }).liveStatus).toBe("was_live");
    expect(metadataOf({ live_status: "something_new" }).liveStatus).toBeUndefined();
  });

  test("sorts chapters, fills missing ends and titles, and drops invalid entries", () => {
    expect(
      metadataOf({
        duration: 30,
        chapters: [
          { start_time: 20, title: "Outro" },
          { start_time: 0, end_time: 10, title: "Intro" },
          { start_time: 10, title: "" },
          { title: "no start" },
          { start_time: 25, end_time: 5, title: "backwards" },
        ],
      }).chapters,
    ).toEqual([
      { title: "Intro", startMs: 0, endMs: 10_000 },
      { title: "Chapter 2", startMs: 10_000, endMs: 20_000 },
      { title: "Outro", startMs: 20_000, endMs: 30_000 },
    ]);
  });

  test("a last chapter without end or duration ends where it starts", () => {
    expect(metadataOf({ chapters: [{ start_time: 5, title: "Only" }] }).chapters).toEqual([
      { title: "Only", startMs: 5000, endMs: 5000 },
    ]);
  });

  test("no valid chapter leaves chapters undefined", () => {
    expect(metadataOf({ chapters: null }).chapters).toBeUndefined();
    expect(metadataOf({ chapters: [{ title: "x" }] }).chapters).toBeUndefined();
  });

  test.each(["[]", '"x"', "{not json"])("%s is YTDLP_OUTPUT_INVALID", (stdout) => {
    const result = parseYtDlpInfo(stdout, "https://example.com/v");

    expect(result.success ? undefined : result.error.code).toBe("YTDLP_OUTPUT_INVALID");
  });
});

describe("interpretYtDlpRun", () => {
  const failed = (stderr: string): ProcessResult => ({ outcome: "exited", exitCode: 1, stdout: "", stderr });
  const URL_ = "https://www.youtube.com/watch?v=abc";
  const BOT =
    "ERROR: [youtube] abc: Sign in to confirm you're not a bot. Use --cookies-from-browser or --cookies for the authentication. See  https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp  for how to manually pass cookies";

  test("a sign-in wall without cookies is SOURCE_AUTH_REQUIRED with the export-cookies hint", () => {
    const result = interpretYtDlpRun(failed(BOT), "youtube_metadata", { url: URL_, timeoutMs: 1000 });

    expect(result.success ? undefined : result.error).toMatchObject({
      code: "SOURCE_AUTH_REQUIRED",
      message: `\`${URL_}\` requires a logged-in session (${BOT}).`,
      hint: "Export cookies for this site from a browser where you are logged in to a cookies.txt file (Netscape format), then run `pi-tube config set cookies.file <absolute path>` or set PI_TUBE_COOKIES_FILE.",
    });
  });

  test("with cookies configured the hint says they did not grant access", () => {
    const result = interpretYtDlpRun(failed(BOT), "download", { url: URL_, timeoutMs: 1000, cookies: "config" });

    expect(result.success ? undefined : result.error.hint).toBe(
      "The configured cookies did not grant access: export fresh cookies from a browser where you are logged in and replace the file.",
    );
  });

  test.each([
    "ERROR: [vimeo] 1: This video is only available for registered users. Use --cookies, --cookies-from-browser, --username and --password, --netrc-cmd, or --netrc (vimeo) to provide account credentials.",
    "ERROR: [youtube] abc: Login details are needed to download this content.",
    "ERROR: [instagram] abc: login required",
  ])("%s is SOURCE_AUTH_REQUIRED", (stderr) => {
    const result = interpretYtDlpRun(failed(stderr), "site_metadata", { url: URL_, timeoutMs: 1000 });

    expect(result.success ? undefined : result.error.code).toBe("SOURCE_AUTH_REQUIRED");
  });

  test("yt-dlp rejecting the cookies file is COOKIES_FILE_INVALID without the temp path", () => {
    const result = interpretYtDlpRun(
      failed("ERROR: '/tmp/x/cookies.txt' does not look like a Netscape format cookies file"),
      "youtube_metadata",
      { url: URL_, timeoutMs: 1000, cookies: "env" },
    );

    expect(result.success ? undefined : result.error).toMatchObject({
      code: "COOKIES_FILE_INVALID",
      message: "yt-dlp rejected the cookies file set by `PI_TUBE_COOKIES_FILE`.",
    });
    expect(JSON.stringify(result)).not.toContain("/tmp/x");
  });

  test("cookie values and stdout never reach the message", () => {
    const result = interpretYtDlpRun(
      {
        outcome: "exited",
        exitCode: 1,
        stdout: '{"formats":[{"cookies":"SID=stdout-secret"}]}\nnull',
        stderr: `WARNING: skipping cookie file entry due to invalid length 1: '.youtube.com TRUE / TRUE 0 SID super-secret\\n'\n${BOT}`,
      },
      "youtube_metadata",
      { url: URL_, timeoutMs: 1000, cookies: "config" },
    );

    expect(result.success ? undefined : result.error.code).toBe("SOURCE_AUTH_REQUIRED");
    const text = JSON.stringify(result);
    expect(text).not.toContain("super-secret");
    expect(text).not.toContain("stdout-secret");
    expect(text).not.toMatch(/ null\)/);
  });

  test("a geo restriction stays an extraction error", () => {
    const result = interpretYtDlpRun(
      failed("ERROR: [youtube] abc: The uploader has not made this video available in your country"),
      "youtube_metadata",
      { url: URL_, timeoutMs: 1000 },
    );

    expect(result.success ? undefined : result.error.code).toBe("YOUTUBE_EXTRACT_FAILED");
  });
});
