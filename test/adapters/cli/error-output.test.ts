import { describe, expect, test } from "vitest";
import { exitCodeFor, formatErrorForCli } from "../../../src/adapters/cli/error-output.ts";
import { createError } from "../../../src/core/domain/errors.ts";

describe("formatErrorForCli", () => {
  test("a message carrying page text or yt-dlp stderr stays on one line without control characters", () => {
    const rendered = formatErrorForCli(
      createError("SOURCE_LIVE_NOT_ENDED", "`Evil\u001b]52;c;aGk=\u0007 show` is live.\nERROR: second line", {
        hint: "Retry\u009b later.",
      }),
    );

    expect(rendered).toBe(
      "[SOURCE_LIVE_NOT_ENDED] `Evil ]52;c;aGk= show` is live. ERROR: second line\nhint: Retry later.",
    );
  });

  test("renders exactly the code line and the hint line", () => {
    const rendered = formatErrorForCli(createError("INPUT_INVALID", "Bad input.", { hint: "Try again." }));

    expect(rendered.split("\n")).toEqual(["[INPUT_INVALID] Bad input.", "hint: Try again."]);
  });
});

describe("exitCodeFor", () => {
  test.each([
    ["INPUT_INVALID", 2],
    ["YTDLP_NOT_FOUND", 3],
    ["PROVIDER_AUTH", 4],
    ["DOWNLOAD_FAILED", 5],
    ["UNEXPECTED", 1],
  ] as const)("%s exits with %i", (code, expected) => {
    expect(exitCodeFor(createError(code, "m"))).toBe(expected);
  });
});
