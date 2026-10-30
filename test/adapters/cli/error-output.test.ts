import { describe, expect, test } from "vitest";
import { exitCodeFor, formatErrorForCli } from "../../../src/adapters/cli/error-output.ts";
import { createError } from "../../../src/core/domain/errors.ts";

describe("formatErrorForCli", () => {
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
