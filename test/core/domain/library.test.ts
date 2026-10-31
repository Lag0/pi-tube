import { describe, expect, test } from "vitest";
import { siteSourceKey, sourceKeyFromInput, transcriptKeyText } from "../../../src/core/domain/library.ts";

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
