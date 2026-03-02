import { describe, expect, test } from "bun:test";
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
    let capturedLanguage: FormDataEntryValue | null = null;
    const provider = createGroqProvider({
      apiKey: "groq-test",
      fetchImpl: async (_input, init) => {
        const body = init?.body as FormData;
        capturedLanguage = body.get("language");

        return new Response(JSON.stringify({ text: "hello from groq", language: "es" }), {
          status: 200,
        });
      },
    });

    const result = await provider.transcribe(request);

    expect(capturedLanguage).toBe("es");
    expect(result.provider).toBe("groq");
    expect(result.transcript).toBe("hello from groq");
    expect(result.requestedLanguage).toBe("es");
    expect(result.detectedLanguage).toBe("es");
  });

  test("maps auth failures to TRANSCRIPTION_PROVIDER_AUTH", async () => {
    const provider = createGroqProvider({
      apiKey: "groq-test",
      fetchImpl: async () => new Response("unauthorized", { status: 401 }),
    });

    await expect(provider.transcribe(request)).rejects.toMatchObject({
      code: "TRANSCRIPTION_PROVIDER_AUTH",
    });
  });

  test("maps rate limiting to TRANSCRIPTION_PROVIDER_RATE_LIMIT", async () => {
    const provider = createGroqProvider({
      apiKey: "groq-test",
      fetchImpl: async () => new Response("too many requests", { status: 429 }),
    });

    await expect(provider.transcribe(request)).rejects.toMatchObject({
      code: "TRANSCRIPTION_PROVIDER_RATE_LIMIT",
    });
  });

  test("maps malformed provider payload to TRANSCRIPTION_PROVIDER_INVALID_RESPONSE", async () => {
    const provider = createGroqProvider({
      apiKey: "groq-test",
      fetchImpl: async () => new Response(JSON.stringify({ language: "es" }), { status: 200 }),
    });

    await expect(provider.transcribe(request)).rejects.toMatchObject({
      code: "TRANSCRIPTION_PROVIDER_INVALID_RESPONSE",
    });
  });
});
