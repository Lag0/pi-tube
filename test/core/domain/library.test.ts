import { describe, expect, test } from "vitest";
import {
  matchesLibraryFilter,
  siteSourceKey,
  sourceKeyFromInput,
  transcriptKeyText,
} from "../../../src/core/domain/library.ts";

describe("sourceKeyFromInput", () => {
  test.each([
    "https://youtu.be/jNQXAC9IVRw",
    "https://www.youtube.com/watch?v=jNQXAC9IVRw&t=30&si=x",
    "https://m.youtube.com/shorts/jNQXAC9IVRw",
    "https://music.youtube.com/watch?v=jNQXAC9IVRw",
    "https://www.youtube.com/live/jNQXAC9IVRw",
    "https://www.youtube.com/embed/jNQXAC9IVRw",
  ])("%s gives the key yt-dlp's metadata gives", (url) => {
    expect(sourceKeyFromInput(url)).toBe("youtube:jNQXAC9IVRw");
    expect(sourceKeyFromInput(url)).toBe(siteSourceKey("Youtube", "jNQXAC9IVRw"));
  });

  test("an Instagram reel gives instagram:<code>, the key yt-dlp's metadata gives", () => {
    expect(sourceKeyFromInput("https://www.instagram.com/reel/Cx1_ab/")).toBe("instagram:Cx1_ab");
    expect(siteSourceKey("Instagram", "Cx1_ab")).toBe("instagram:Cx1_ab");
  });

  test.each([
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/playlist?list=PL1",
    "https://vimeo.com/1",
    "./a.mp3",
    "https://cdn.example.com/a.mp3",
  ])("%s has no key before the resolve", (input) => {
    expect(sourceKeyFromInput(input)).toBeUndefined();
  });
});

describe("transcriptKeyText", () => {
  test("joins the parts and uses auto without a language", () => {
    expect(transcriptKeyText({ sourceKey: "youtube:x", provider: "groq", model: "m" })).toBe(
      "youtube:x\ngroq\nm\nauto",
    );
    expect(transcriptKeyText({ sourceKey: "youtube:x", provider: "groq", model: "m", language: "pt" })).toBe(
      "youtube:x\ngroq\nm\npt",
    );
  });
});

describe("matchesLibraryFilter", () => {
  const entry = { provider: "groq", kind: "youtube", generatedAt: "2026-10-31T23:59:59.000Z" } as const;

  test("an empty filter keeps every entry", () => {
    expect(matchesLibraryFilter(entry, {})).toBe(true);
  });

  test("the filters combine as AND", () => {
    expect(matchesLibraryFilter(entry, { provider: "groq", kind: "youtube" })).toBe(true);
    expect(matchesLibraryFilter(entry, { provider: "groq", kind: "local_file" })).toBe(false);
    expect(matchesLibraryFilter(entry, { provider: "deepgram", kind: "youtube" })).toBe(false);
  });

  test("since and until compare the UTC day of generatedAt, both inclusive", () => {
    expect(matchesLibraryFilter(entry, { until: "2026-10-31" })).toBe(true);
    expect(matchesLibraryFilter(entry, { since: "2026-10-31" })).toBe(true);
    expect(matchesLibraryFilter(entry, { since: "2026-11-01" })).toBe(false);
    expect(matchesLibraryFilter(entry, { until: "2026-10-30" })).toBe(false);
  });

  test("a date with an offset (a v2 import) counts by its UTC day", () => {
    const imported = { ...entry, generatedAt: "2026-11-01T01:00:00+03:00" };

    expect(matchesLibraryFilter(imported, { until: "2026-10-31" })).toBe(true);
    expect(matchesLibraryFilter(imported, { since: "2026-11-01" })).toBe(false);
  });
});
