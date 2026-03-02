import { describe, expect, test } from "bun:test";
import type { ResolvedSource } from "../../src/intake/types.ts";
import { transcribeFromResolvedSource } from "../../src/transcription/service.ts";
import type { ProviderRegistry } from "../../src/transcription/providers/index.ts";

const source: ResolvedSource = {
  kind: "direct_url",
  originalInput: "https://cdn.example.com/audio/demo.wav",
  normalizedUrl: "https://cdn.example.com/audio/demo.wav",
  mediaUrl: "https://cdn.example.com/audio/demo.wav",
  extension: "wav",
};

function providers(): ProviderRegistry {
  return {
    deepgram: {
      id: "deepgram",
      async transcribe(request) {
        return {
          provider: "deepgram",
          transcript: `deepgram:${request.requestedLanguage ?? "auto"}`,
          requestedLanguage: request.requestedLanguage,
          detectedLanguage: "en",
        };
      },
    },
    groq: {
      id: "groq",
      async transcribe(request) {
        return {
          provider: "groq",
          transcript: `groq:${request.requestedLanguage ?? "auto"}`,
          requestedLanguage: request.requestedLanguage,
          detectedLanguage: "pt",
        };
      },
    },
  };
}

describe("transcription service", () => {
  test("uses CLI provider over env fallback", async () => {
    const result = await transcribeFromResolvedSource(source, {
      provider: "groq",
      env: { PI_TUBE_TRANSCRIPTION_PROVIDER: "deepgram" },
      providers: providers(),
    });

    expect(result.provider).toBe("groq");
    expect(result.transcript).toContain("groq");
  });

  test("uses env provider fallback when CLI provider is omitted", async () => {
    const result = await transcribeFromResolvedSource(source, {
      env: { PI_TUBE_TRANSCRIPTION_PROVIDER: "groq" },
      providers: providers(),
    });

    expect(result.provider).toBe("groq");
  });

  test("applies language preference from CLI or env fallback", async () => {
    const fromCli = await transcribeFromResolvedSource(source, {
      provider: "deepgram",
      language: "PT-BR",
      env: { PI_TUBE_TRANSCRIPTION_LANGUAGE: "en" },
      providers: providers(),
    });

    const fromEnv = await transcribeFromResolvedSource(source, {
      provider: "deepgram",
      env: { PI_TUBE_TRANSCRIPTION_LANGUAGE: "es" },
      providers: providers(),
    });

    expect(fromCli.requestedLanguage).toBe("pt-br");
    expect(fromEnv.requestedLanguage).toBe("es");
  });

  test("keeps canonical output shape identical across providers", async () => {
    const deepgram = await transcribeFromResolvedSource(source, {
      provider: "deepgram",
      providers: providers(),
    });
    const groq = await transcribeFromResolvedSource(source, {
      provider: "groq",
      providers: providers(),
    });

    expect(Object.keys(deepgram).sort()).toEqual(Object.keys(groq).sort());
    expect(deepgram.source.kind).toBe("direct_url");
    expect(groq.source.kind).toBe("direct_url");
  });
});
