import { describe, expect, test } from "bun:test";
import { createDeepgramProvider } from "../../src/transcription/providers/deepgram.ts";
import type { TranscriptionRequest } from "../../src/transcription/types.ts";

const request: TranscriptionRequest = {
  source: {
    kind: "direct_url",
    originalInput: "https://cdn.example.com/audio/demo.wav",
    normalizedUrl: "https://cdn.example.com/audio/demo.wav",
    mediaUrl: "https://cdn.example.com/audio/demo.wav",
    extension: "wav",
  },
  requestedLanguage: "pt",
};

describe("deepgram provider", () => {
  test("maps successful response to canonical result and forwards requested language", async () => {
    let capturedLanguage: FormDataEntryValue | null = null;
    const provider = createDeepgramProvider({
      apiKey: "dg-test",
      fetchImpl: async (_input, init) => {
        const body = init?.body as FormData;
        capturedLanguage = body.get("language");

        return new Response(
          JSON.stringify({
            results: {
              channels: [
                {
                  detected_language: "en",
                  alternatives: [{ transcript: "hello from deepgram" }],
                },
              ],
            },
          }),
          { status: 200 },
        );
      },
    });

    const result = await provider.transcribe(request);

    expect(capturedLanguage).toBe("pt");
    expect(result.provider).toBe("deepgram");
    expect(result.transcript).toBe("hello from deepgram");
    expect(result.requestedLanguage).toBe("pt");
    expect(result.detectedLanguage).toBe("en");
  });

  test("maps auth failures to TRANSCRIPTION_PROVIDER_AUTH", async () => {
    const provider = createDeepgramProvider({
      apiKey: "dg-test",
      fetchImpl: async () => new Response("invalid api key", { status: 401 }),
    });

    await expect(provider.transcribe(request)).rejects.toMatchObject({
      code: "TRANSCRIPTION_PROVIDER_AUTH",
    });
  });

  test("maps rate limiting to TRANSCRIPTION_PROVIDER_RATE_LIMIT", async () => {
    const provider = createDeepgramProvider({
      apiKey: "dg-test",
      fetchImpl: async () => new Response("too many requests", { status: 429 }),
    });

    await expect(provider.transcribe(request)).rejects.toMatchObject({
      code: "TRANSCRIPTION_PROVIDER_RATE_LIMIT",
    });
  });

  test("maps malformed provider payload to TRANSCRIPTION_PROVIDER_INVALID_RESPONSE", async () => {
    const provider = createDeepgramProvider({
      apiKey: "dg-test",
      fetchImpl: async () => new Response(JSON.stringify({ results: {} }), { status: 200 }),
    });

    await expect(provider.transcribe(request)).rejects.toMatchObject({
      code: "TRANSCRIPTION_PROVIDER_INVALID_RESPONSE",
    });
  });
});
