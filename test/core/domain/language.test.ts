import { describe, expect, test } from "vitest";
import { normalizeLanguageTag, sameLanguage } from "../../../src/core/domain/language.ts";

describe("normalizeLanguageTag", () => {
  test.each([
    ["Portuguese", "pt"],
    ["portuguese", "pt"],
    ["por", "pt"],
    ["eng", "en"],
    ["English", "en"],
    ["EN", "en"],
    ["pt-BR", "pt-br"],
    ["Haitian Creole", "ht"],
    ["cmn", "zh"],
    ["klingon", "klingon"],
  ])("%s → %s", (value, expected) => {
    expect(normalizeLanguageTag(value)).toBe(expected);
  });

  test.each([undefined, "", "   "])("%j → undefined", (value) => {
    expect(normalizeLanguageTag(value)).toBeUndefined();
  });
});

describe("sameLanguage", () => {
  test.each([
    ["pt", "Portuguese", true],
    ["pt-br", "pt", true],
    ["pt", "por", true],
    ["en", "pt", false],
    ["en", undefined, false],
  ])("%s vs %s → %s", (requested, detected, expected) => {
    expect(sameLanguage(requested, detected)).toBe(expected);
  });
});
