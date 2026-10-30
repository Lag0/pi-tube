import { describe, expect, test } from "vitest";
import { mapProviderError } from "../../../src/infrastructure/stt/http-errors.ts";

const withStatus = (status: number | undefined, field: "status" | "statusCode" = "status") =>
  Object.assign(new Error("upstream said no"), status === undefined ? {} : { [field]: status });

describe("mapProviderError", () => {
  test.each([
    [401, "PROVIDER_AUTH"],
    [403, "PROVIDER_AUTH"],
    [429, "PROVIDER_RATE_LIMIT"],
    [408, "PROVIDER_UNAVAILABLE"],
    [500, "PROVIDER_UNAVAILABLE"],
    [503, "PROVIDER_UNAVAILABLE"],
    [400, "PROVIDER_FAILED"],
    [422, "PROVIDER_FAILED"],
    [undefined, "PROVIDER_UNAVAILABLE"],
  ] as const)("status %s is %s", (status, code) => {
    expect(mapProviderError("groq", withStatus(status)).code).toBe(code);
  });

  test("reads statusCode too", () => {
    expect(mapProviderError("elevenlabs", withStatus(401, "statusCode")).code).toBe("PROVIDER_AUTH");
  });

  test("names the provider and keeps the upstream detail", () => {
    expect(mapProviderError("deepgram", withStatus(400)).message).toContain("`deepgram`");
    expect(mapProviderError("deepgram", withStatus(400)).message).toContain("upstream said no");
  });
});
