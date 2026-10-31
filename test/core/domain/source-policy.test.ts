import { describe, expect, test } from "vitest";
import type { LiveStatus, ResolvedSource } from "../../../src/core/domain/source.ts";
import {
  classifyInput,
  ensureFinishedMedia,
  getLocalFileExtension,
  isDirectMediaUrl,
  normalizeDirectMediaUrl,
  tierOf,
} from "../../../src/core/domain/source-policy.ts";

describe("classifyInput", () => {
  test.each([
    ["https://www.youtube.com/watch?v=abc", "youtube"],
    ["https://youtu.be/abc", "youtube"],
    ["https://www.instagram.com/reel/abc/", "instagram"],
    ["https://cdn.example.com/a.mp3", "direct_url"],
    ["https://example.com/page", "site"],
    ["https://vimeo.com/76979871", "site"],
    ["./clip.mp4", "local_file"],
    ["-o/tmp/x", "local_file"],
    ["--exec=calc", "local_file"],
  ] as const)("%s is %s", (input, kind) => {
    expect(classifyInput(input)).toBe(kind);
  });
});

describe("tierOf", () => {
  test.each([
    ["youtube", "tested"],
    ["instagram", "tested"],
    ["direct_url", "tested"],
    ["local_file", "tested"],
    ["site", "best_effort"],
  ] as const)("%s is %s", (kind, tier) => {
    expect(tierOf(kind)).toBe(tier);
  });
});

describe("ensureFinishedMedia", () => {
  const live = (liveStatus?: LiveStatus, title?: string): ResolvedSource => ({
    kind: "youtube",
    originalInput: "https://www.youtube.com/watch?v=abc",
    normalizedUrl: "https://www.youtube.com/watch?v=abc",
    metadata: { platform: "Youtube", ...(liveStatus ? { liveStatus } : {}), ...(title ? { title } : {}) },
  });

  test.each(["is_live", "is_upcoming"] as const)("%s is SOURCE_LIVE_NOT_ENDED", (status) => {
    const result = ensureFinishedMedia(live(status, "Show"));

    expect(result.success ? undefined : result.error).toEqual({
      code: "SOURCE_LIVE_NOT_ENDED",
      message: `\`Show\` is a live stream that has not ended (live_status=${status}).`,
      hint: "Retry once the stream has ended and its recording is available; pi-tube transcribes finished streams only.",
    });
  });

  test("post_live names the recording that is still being processed, by URL when untitled", () => {
    const result = ensureFinishedMedia(live("post_live"));

    expect(result.success ? undefined : result.error.message).toBe(
      "`https://www.youtube.com/watch?v=abc` is a live stream whose recording is still being processed (live_status=post_live).",
    );
  });

  test.each([["was_live"], ["not_live"], [undefined]] as const)("%s is fine", (status) => {
    expect(ensureFinishedMedia(live(status)).success).toBe(true);
  });

  test("direct URLs and local files are fine", () => {
    expect(
      ensureFinishedMedia({
        kind: "direct_url",
        originalInput: "https://x.test/a.mp3",
        normalizedUrl: "https://x.test/a.mp3",
        mediaUrl: "https://x.test/a.mp3",
        extension: "mp3",
      }).success,
    ).toBe(true);
    expect(
      ensureFinishedMedia({ kind: "local_file", originalInput: "a.mp3", absolutePath: "/a.mp3", extension: "mp3" })
        .success,
    ).toBe(true);
  });
});

describe("media extensions", () => {
  test("reads the extension without node:path", () => {
    expect(getLocalFileExtension("C:\\media\\Clip.MP3")).toBe("mp3");
    expect(getLocalFileExtension("/tmp/notes.txt")).toBeNull();
    expect(isDirectMediaUrl("https://cdn.example.com/a.wav?sig=1")).toBe(true);
  });

  test("normalizes a direct media URL without its fragment", () => {
    expect(normalizeDirectMediaUrl(new URL("https://cdn.example.com/a.mp3?x=1#t"))).toBe(
      "https://cdn.example.com/a.mp3?x=1",
    );
  });
});
