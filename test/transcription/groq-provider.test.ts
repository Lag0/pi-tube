import { describe, expect, test } from "vitest";
import { createGroqProvider } from "../../src/transcription/providers/groq.ts";
import type { TranscriptionRequest } from "../../src/transcription/types.ts";

const request: TranscriptionRequest = {
  source: {
    kind: "direct_url",
    originalInput: "https://cdn.example.com/audio/demo.wav",
    normalizedUrl: "https://cdn.example.com/audio/demo.wav",
    mediaUrl: "https://cdn.example.com/audio/demo.wav",
    extension: "wav",
  },
  requestedLanguage: "es",
};

describe("groq provider", () => {
  test("maps successful response to canonical result and forwards requested language", async () => {
    let capturedLanguage: unknown = null;
    const provider = createGroqProvider({
      client: {
        async create(payload) {
          capturedLanguage = payload.language;
          return { text: "hello from groq", language: "es" };
        },
      },
    });

    const result = await provider.transcribe(request);

    expect(capturedLanguage).toBe("es");
    expect(result.provider).toBe("groq");
    expect(result.transcript).toBe("hello from groq");
    expect(result.requestedLanguage).toBe("es");
    expect(result.detectedLanguage).toBe("es");
  });

  test("normalizes optional segment timestamps when provider returns them", async () => {
    const provider = createGroqProvider({
      client: {
        async create() {
          return {
            text: "hello from groq",
            language: "es",
            segments: [
              { start: 0.2, end: 0.8, text: "hello" },
              { start: 0.81, end: 1.1, text: "from" },
            ],
          };
        },
      },
    });

    const result = await provider.transcribe(request);

    expect(result.segments).toEqual([
      { startMs: 200, endMs: 800, text: "hello" },
      { startMs: 810, endMs: 1100, text: "from" },
    ]);
  });

  test("maps auth failures to TRANSCRIPTION_PROVIDER_AUTH", async () => {
    const provider = createGroqProvider({
      client: {
        async create() {
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
    const provider = createGroqProvider({
      client: {
        async create() {
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
    const provider = createGroqProvider({
      client: {
        async create() {
          return { language: "es" };
        },
      },
    });

    await expect(provider.transcribe(request)).rejects.toMatchObject({
      code: "TRANSCRIPTION_PROVIDER_INVALID_RESPONSE",
    });
  });
});
