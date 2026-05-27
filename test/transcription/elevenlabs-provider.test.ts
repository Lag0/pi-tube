import { describe, expect, test } from "vitest";
import { createElevenLabsProvider } from "../../src/transcription/providers/elevenlabs.ts";
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

describe("elevenlabs provider", () => {
  test("uses Scribe v2 and maps successful response to canonical result", async () => {
    let capturedPayload: unknown;
    const provider = createElevenLabsProvider({
      client: {
        async convert(payload) {
          capturedPayload = payload;
          return {
            text: "hello from elevenlabs",
            language_code: "en",
            words: [
              { text: "hello", start: 0.12, end: 0.4, type: "word" },
              { text: " ", start: 0.4, end: 0.42, type: "spacing" },
              { text: "elevenlabs", start: 0.45, end: 1.1, type: "word" },
            ],
          };
        },
      },
    });

    const result = await provider.transcribe(request);

    expect(capturedPayload).toMatchObject({
      modelId: "scribe_v2",
      sourceUrl: "https://cdn.example.com/audio/demo.wav",
      languageCode: "pt",
      timestampsGranularity: "word",
    });
    expect(result.provider).toBe("elevenlabs");
    expect(result.transcript).toBe("hello from elevenlabs");
    expect(result.requestedLanguage).toBe("pt");
    expect(result.detectedLanguage).toBe("en");
    expect(result.segments).toEqual([
      { startMs: 120, endMs: 400, text: "hello" },
      { startMs: 450, endMs: 1100, text: "elevenlabs" },
    ]);
  });

  test("maps auth failures to TRANSCRIPTION_PROVIDER_AUTH", async () => {
    const provider = createElevenLabsProvider({
      client: {
        async convert() {
          const error = new Error("unauthorized") as Error & { status: number };
          error.status = 401;
          throw error;
        },
      },
    });

    await expect(provider.transcribe(request)).rejects.toMatchObject({
      code: "TRANSCRIPTION_PROVIDER_AUTH",
    });
  });

  test("maps rate limiting to TRANSCRIPTION_PROVIDER_RATE_LIMIT", async () => {
    const provider = createElevenLabsProvider({
      client: {
        async convert() {
          const error = new Error("too many requests") as Error & { status: number };
          error.status = 429;
          throw error;
        },
      },
    });

    await expect(provider.transcribe(request)).rejects.toMatchObject({
      code: "TRANSCRIPTION_PROVIDER_RATE_LIMIT",
    });
  });

  test("maps malformed provider payload to TRANSCRIPTION_PROVIDER_INVALID_RESPONSE", async () => {
    const provider = createElevenLabsProvider({
      client: {
        async convert() {
          return { language_code: "en" };
        },
      },
    });

    await expect(provider.transcribe(request)).rejects.toMatchObject({
      code: "TRANSCRIPTION_PROVIDER_INVALID_RESPONSE",
    });
  });
});
