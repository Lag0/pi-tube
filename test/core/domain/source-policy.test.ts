import { describe, expect, test } from "vitest";
import {
  classifyInput,
  getLocalFileExtension,
  isDirectMediaUrl,
  normalizeDirectMediaUrl,
} from "../../../src/core/domain/source-policy.ts";

describe("classifyInput", () => {
  test.each([
    ["https://www.youtube.com/watch?v=abc", "youtube"],
    ["https://youtu.be/abc", "youtube"],
    ["https://www.instagram.com/reel/abc/", "instagram"],
    ["https://cdn.example.com/a.mp3", "direct_url"],
    ["https://example.com/page", "unsupported_url"],
    ["./clip.mp4", "local_file"],
    ["-o/tmp/x", "local_file"],
    ["--exec=calc", "local_file"],
  ] as const)("%s is %s", (input, kind) => {
    expect(classifyInput(input)).toBe(kind);
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
