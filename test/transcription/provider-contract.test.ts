import { describe, expect, test } from "bun:test";
import type { ResolvedSource } from "../../src/intake/types.ts";
import {
  selectTranscriptionProvider,
  transcribeFromResolvedSource,
} from "../../src/transcription/service.ts";
import type { ProviderRegistry } from "../../src/transcription/providers/index.ts";

const sampleSource: ResolvedSource = {
  kind: "direct_url",
  originalInput: "https://cdn.example.com/audio/demo.wav",
  normalizedUrl: "https://cdn.example.com/audio/demo.wav",
  mediaUrl: "https://cdn.example.com/audio/demo.wav",
  extension: "wav",
};

function makeRegistry(): ProviderRegistry {
  return {
    deepgram: {
      id: "deepgram",
      async transcribe(request) {
        return {
          provider: "deepgram",
          transcript: `deepgram:${request.source.kind}`,
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
          transcript: `groq:${request.source.kind}`,
          requestedLanguage: request.requestedLanguage,
          detectedLanguage: "pt",
        };
      },
    },
  };
}

describe("transcription provider contract", () => {
  test("selects provider with deterministic precedence: CLI > env > default", () => {
    expect(selectTranscriptionProvider({ provider: "groq", env: { PI_TUBE_TRANSCRIPTION_PROVIDER: "deepgram" } })).toBe("groq");
    expect(selectTranscriptionProvider({ env: { PI_TUBE_TRANSCRIPTION_PROVIDER: "groq" } })).toBe("groq");
    expect(selectTranscriptionProvider({})).toBe("deepgram");
  });

  test("returns canonical provider-agnostic result shape", async () => {
    const result = await transcribeFromResolvedSource(sampleSource, {
      provider: "deepgram",
      language: "EN-US",
      providers: makeRegistry(),
    });

    expect(result.source.kind).toBe("direct_url");
    expect(result.provider).toBe("deepgram");
    expect(result.transcript).toBe("deepgram:direct_url");
    expect(result.requestedLanguage).toBe("en-us");
    expect(result.detectedLanguage).toBe("en");
  });

  test("throws stable error for invalid provider values", async () => {
    await expect(
      transcribeFromResolvedSource(sampleSource, {
        provider: "unknown",
        providers: makeRegistry(),
      }),
    ).rejects.toMatchObject({ code: "TRANSCRIPTION_PROVIDER_INVALID" });
  });

  test("throws stable error when selected provider is not registered", async () => {
    await expect(
      transcribeFromResolvedSource(sampleSource, {
        provider: "deepgram",
        providers: {},
      }),
    ).rejects.toMatchObject({ code: "TRANSCRIPTION_PROVIDER_UNAVAILABLE" });
  });
});
