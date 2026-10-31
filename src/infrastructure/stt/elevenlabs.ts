import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
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

interface ElevenLabsSpeechToTextPayload {
  modelId: string;
  file?: Blob;
  sourceUrl?: string;
  languageCode?: string;
  timestampsGranularity?: "word" | "character";
  tagAudioEvents?: boolean;
}

interface ElevenLabsRequestOptions {
  readonly abortSignal?: AbortSignal;
  readonly timeoutInSeconds?: number;
  readonly maxRetries?: number;
}

interface ElevenLabsSpeechToTextClient {
  convert(payload: ElevenLabsSpeechToTextPayload, options?: ElevenLabsRequestOptions): Promise<unknown>;
}

export interface ElevenLabsProviderOptions {
  /** Builds the speech-to-text client for a key; tests inject a fake. */
  readonly createClient?: (apiKey: string) => ElevenLabsSpeechToTextClient;
  readonly model?: string;
  readonly timeoutMs?: number;
}

function normalizeElevenLabsSegments(words: unknown[]): TranscriptionSegment[] | undefined {
  const segments: TranscriptionSegment[] = [];

  for (const rawWord of words) {
    if (!rawWord || typeof rawWord !== "object") {
      continue;
    }

    const word = rawWord as {
      text?: unknown;
      start?: unknown;
      end?: unknown;
      type?: unknown;
    };
    if (word.type && word.type !== "word") {
      continue;
    }

    const text = typeof word.text === "string" ? word.text.trim() : "";
    if (!text) {
      continue;
    }

    if (
      typeof word.start !== "number" ||
      !Number.isFinite(word.start) ||
      typeof word.end !== "number" ||
      !Number.isFinite(word.end)
    ) {
      continue;
    }

    const startMs = Math.round(word.start * 1000);
    const endMs = Math.round(word.end * 1000);
    if (endMs < startMs) {
      continue;
    }

    segments.push({ startMs, endMs, text });
  }

  return segments.length > 0 ? segments : undefined;
}

function parseElevenLabsResponse(payload: unknown): ParsedTranscript | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const text =
    typeof (payload as { text?: unknown }).text === "string" ? (payload as { text: string }).text.trim() : "";
  if (!text) {
    return undefined;
  }

  const detectedLanguage =
    typeof (payload as { language_code?: unknown }).language_code === "string"
      ? (payload as { language_code: string }).language_code
      : typeof (payload as { languageCode?: unknown }).languageCode === "string"
        ? (payload as { languageCode: string }).languageCode
        : undefined;
  const words = Array.isArray((payload as { words?: unknown[] }).words)
    ? ((payload as { words?: unknown[] }).words ?? [])
    : [];
  const segments = normalizeElevenLabsSegments(words);

  return { transcript: text, detectedLanguage, segments };
}

const defaultClient = (apiKey: string): ElevenLabsSpeechToTextClient =>
  new ElevenLabsClient({ apiKey }).speechToText as ElevenLabsSpeechToTextClient;

/** ElevenLabs Scribe, highest accuracy. The SDK honors the abort signal and the per-request timeout. */
export const createElevenLabsProvider = (options: ElevenLabsProviderOptions = {}): SttProvider => {
  const model = options.model ?? "scribe_v2";
  const timeoutMs = options.timeoutMs ?? PROVIDER_REQUEST_TIMEOUT_MS;
  const createClient = options.createClient ?? defaultClient;

  return {
    id: "elevenlabs",
    model,
    capabilities: CLOUD_STT_CAPABILITIES,
    transcribe: (request, operation) =>
      runProviderCall({
        provider: "elevenlabs",
        request,
        options: operation,
        timeoutMs,
        call: (audio, signal) => {
          const payload: ElevenLabsSpeechToTextPayload = {
            modelId: model,
            timestampsGranularity: "word",
            tagAudioEvents: true,
          };
          if (request.language) payload.languageCode = request.language;
          if (audio.kind === "url") payload.sourceUrl = audio.url;
          else payload.file = new File([new Uint8Array(audio.bytes)], audio.name);
          return createClient(request.apiKey).convert(payload, {
            abortSignal: signal,
            timeoutInSeconds: Math.ceil(timeoutMs / 1000),
            maxRetries: 2,
          });
        },
        interpret: (response) => {
          const parsed = parseElevenLabsResponse(response);
          return parsed ? ok(parsed) : err(invalidResponseError("elevenlabs"));
        },
      }),
  };
};
