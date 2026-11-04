import { describe, expect, test } from "vitest";
import { estimateTokens } from "../../../src/core/domain/text.ts";

describe("estimateTokens", () => {
  test.each([
    [0, 0],
    [1, 1],
    [4, 1],
    [5, 2],
    [100000, 25000],
  ])("%i characters are about %i tokens", (characters, tokens) => {
    expect(estimateTokens(characters)).toBe(tokens);
  });
});
