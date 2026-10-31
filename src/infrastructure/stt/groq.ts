import Groq, { toFile } from "groq-sdk";
import type { TranscriptionCreateParams } from "groq-sdk/resources/audio/transcriptions";
import { err, ok } from "../../core/domain/result.ts";
import type { TranscriptionSegment } from "../../core/domain/transcript/types.ts";
import type { SttProvider } from "../../core/ports/stt-provider.ts";
import {
  CLOUD_STT_CAPABILITIES,
  type ParsedTranscript,
  PROVIDER_REQUEST_TIMEOUT_MS,
  runProviderCall,
} from "./deadline.ts";
import { invalidResponseError } from "./http-errors.ts";

interface GroqRequestOptions {
  readonly signal?: AbortSignal;
  readonly timeout?: number;
  readonly maxRetries?: number;
}

interface GroqAudioTranscriptionClient {
  create(payload: TranscriptionCreateParams, options?: GroqRequestOptions): Promise<unknown>;
}

export interface GroqProviderOptions {
  /** Builds the transcription client for a key; tests inject a fake. */
  readonly createClient?: (apiKey: string) => GroqAudioTranscriptionClient;
  readonly model?: string;
  readonly timeoutMs?: number;
}

function normalizeGroqSegments(rawSegments: unknown[]): TranscriptionSegment[] | undefined {
  const segments: TranscriptionSegment[] = [];

  for (const rawSegment of rawSegments) {
    if (!rawSegment || typeof rawSegment !== "object") {
      continue;
    }

    const segment = rawSegment as {
      start?: unknown;
      end?: unknown;
      start_ms?: unknown;
      end_ms?: unknown;
      text?: unknown;
    };
    const text = typeof segment.text === "string" ? segment.text.trim() : "";
    if (!text) {
      continue;
    }

    const fromMilliseconds =
      typeof segment.start_ms === "number" &&
      Number.isFinite(segment.start_ms) &&
      typeof segment.end_ms === "number" &&
      Number.isFinite(segment.end_ms);
    const fromSeconds =
      typeof segment.start === "number" &&
      Number.isFinite(segment.start) &&
      typeof segment.end === "number" &&
      Number.isFinite(segment.end);

    if (!fromMilliseconds && !fromSeconds) {
      continue;
    }

    const startMs = fromMilliseconds
      ? Math.round(segment.start_ms as number)
      : Math.round((segment.start as number) * 1000);
    const endMs = fromMilliseconds ? Math.round(segment.end_ms as number) : Math.round((segment.end as number) * 1000);

    if (endMs < startMs) {
      continue;
    }

    segments.push({ startMs, endMs, text });
  }

  return segments.length > 0 ? segments : undefined;
}

function parseGroqResponse(payload: unknown): ParsedTranscript | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const text =
    typeof (payload as { text?: unknown }).text === "string" ? (payload as { text: string }).text.trim() : "";
  if (!text) {
    return undefined;
  }

  const detectedLanguage =
    typeof (payload as { language?: unknown }).language === "string"
      ? (payload as { language: string }).language || undefined
      : undefined;
  const rawSegments = Array.isArray((payload as { segments?: unknown[] }).segments)
    ? ((payload as { segments?: unknown[] }).segments ?? [])
    : [];
  const segments = normalizeGroqSegments(rawSegments);

  return { transcript: text, detectedLanguage, segments };
}

const defaultClient = (apiKey: string): GroqAudioTranscriptionClient => new Groq({ apiKey }).audio.transcriptions;

/** Groq Whisper, best value. The SDK honors the signal and the per-request timeout. */
export const createGroqProvider = (options: GroqProviderOptions = {}): SttProvider => {
  const model = options.model ?? "whisper-large-v3";
  const timeoutMs = options.timeoutMs ?? PROVIDER_REQUEST_TIMEOUT_MS;
  const createClient = options.createClient ?? defaultClient;

  return {
    id: "groq",
    model,
    capabilities: CLOUD_STT_CAPABILITIES,
    transcribe: (request, operation) =>
      runProviderCall({
        provider: "groq",
        request,
        options: operation,
        timeoutMs,
        call: async (audio, signal) => {
          const payload: TranscriptionCreateParams = {
            model,
            response_format: "verbose_json",
            timestamp_granularities: ["segment", "word"],
          };
          if (request.language) payload.language = request.language;
          if (audio.kind === "url") payload.url = audio.url;
          else payload.file = await toFile(audio.bytes, audio.name);
          return createClient(request.apiKey).create(payload, { signal, timeout: timeoutMs, maxRetries: 2 });
        },
        interpret: (response) => {
          const parsed = parseGroqResponse(response);
          return parsed ? ok(parsed) : err(invalidResponseError("groq"));
        },
      }),
  };
};
