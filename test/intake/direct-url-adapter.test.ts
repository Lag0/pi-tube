import { describe, expect, test } from "bun:test";
import { resolveDirectUrlSource } from "../../src/intake/adapters/direct-url.ts";

describe("direct URL adapter", () => {
  test("accepts and normalizes supported direct media URLs", async () => {
    const source = await resolveDirectUrlSource("https://cdn.example.com/video/sample.mp4?token=abc#fragment");

    expect(source.kind).toBe("direct_url");
    expect(source.extension).toBe("mp4");
    expect(source.mediaUrl).toBe("https://cdn.example.com/video/sample.mp4?token=abc");
  });

  test("rejects unsupported non-direct URLs with deterministic error", async () => {
    await expect(resolveDirectUrlSource("https://example.com/article")).rejects.toMatchObject({
      code: "UNSUPPORTED_URL_NOT_DIRECT_MEDIA",
    });
  });
});
