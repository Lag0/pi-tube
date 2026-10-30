import { describe, expect, test } from "vitest";
import { createError, ERROR_CATALOG, getErrorCategory, toPiTubeError } from "../../../src/core/domain/errors.ts";
import { CliError } from "../../../src/errors/cli-errors.ts";

describe("createError", () => {
  test("uses the catalog hint by default", () => {
    expect(createError("PROVIDER_AUTH", "m")).toEqual({
      code: "PROVIDER_AUTH",
      message: "m",
      hint: ERROR_CATALOG.PROVIDER_AUTH.hint,
    });
  });

  test("accepts a hint override", () => {
    expect(createError("PROVIDER_AUTH", "m", { hint: "h" }).hint).toBe("h");
  });
});

describe("getErrorCategory", () => {
  test("returns the catalog category", () => {
    expect(getErrorCategory("YTDLP_NOT_FOUND")).toBe("dependency");
  });
});

describe("toPiTubeError", () => {
  test("converts a legacy CliError, joining its guidance into one hint", () => {
    const legacy = new CliError("m", { code: "INPUT_INVALID", guidance: ["a", "a", " b "] });

    expect(toPiTubeError(legacy)).toEqual({ code: "INPUT_INVALID", message: "m", hint: "a b" });
  });

  test("maps an unknown Error to UNEXPECTED keeping its message", () => {
    const converted = toPiTubeError(new SyntaxError("x"));

    expect(converted.code).toBe("UNEXPECTED");
    expect(converted.message).toBe("x");
  });

  test("maps a non-Error value to UNEXPECTED with a generic message", () => {
    const converted = toPiTubeError("boom");

    expect(converted.code).toBe("UNEXPECTED");
    expect(converted.message).toBe("Unexpected failure.");
  });
});
