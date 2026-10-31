import { createClient as createDeepgramClient } from "@deepgram/sdk";
import { err, ok } from "../../core/domain/result.ts";
import type { TranscriptionSegment } from "../../core/domain/transcript/types.ts";
import type { SttProvider } from "../../core/ports/stt-provider.ts";
import {
  CLOUD_STT_CAPABILITIES,
  type ParsedTranscript,
  PROVIDER_REQUEST_TIMEOUT_MS,
  runProviderCall,
} from "./deadline.ts";
import { invalidResponseError, mapProviderError } from "./http-errors.ts";

interface DeepgramSdkResponse {
  readonly result: unknown;
  readonly error: { readonly message?: string; readonly status?: number } | null;
}

interface DeepgramListenClient {
  transcribeUrl(source: { url: string }, options?: Record<string, unknown>): Promise<DeepgramSdkResponse>;
  transcribeFile(source: Buffer, options?: Record<string, unknown>): Promise<DeepgramSdkResponse>;
}

export interface DeepgramProviderOptions {
  /** Builds the listen client for a key; tests inject a fake. */
  readonly createClient?: (apiKey: string) => DeepgramListenClient;
  readonly model?: string;
  readonly timeoutMs?: number;
}

function normalizeDeepgramSegments(words: unknown[]): TranscriptionSegment[] | undefined {
  const segments: TranscriptionSegment[] = [];

  for (const rawWord of words) {
    if (!rawWord || typeof rawWord !== "object") {
      continue;
    }

    const word = rawWord as {
      word?: unknown;
      text?: unknown;
      start?: unknown;
      end?: unknown;
      start_ms?: unknown;
      end_ms?: unknown;
    };
    const text =
      typeof word.word === "string" ? word.word.trim() : typeof word.text === "string" ? word.text.trim() : "";
    if (!text) {
      continue;
    }

    const fromMilliseconds =
      typeof word.start_ms === "number" &&
      Number.isFinite(word.start_ms) &&
      typeof word.end_ms === "number" &&
      Number.isFinite(word.end_ms);
    const fromSeconds =
      typeof word.start === "number" &&
      Number.isFinite(word.start) &&
      typeof word.end === "number" &&
      Number.isFinite(word.end);

    if (!fromMilliseconds && !fromSeconds) {
      continue;
    }

    const startMs = fromMilliseconds ? Math.round(word.start_ms as number) : Math.round((word.start as number) * 1000);
    const endMs = fromMilliseconds ? Math.round(word.end_ms as number) : Math.round((word.end as number) * 1000);

    if (endMs < startMs) {
      continue;
    }

    segments.push({ startMs, endMs, text });
  }

  return segments.length > 0 ? segments : undefined;
}

function parseDeepgramResponse(payload: unknown): ParsedTranscript | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const channel = (payload as { results?: { channels?: unknown[] } }).results?.channels?.[0] as
    | { alternatives?: unknown[]; detected_language?: unknown; language?: unknown }
    | undefined;
  const alternative = channel?.alternatives?.[0] as { transcript?: unknown } | undefined;
  const transcript = typeof alternative?.transcript === "string" ? alternative.transcript.trim() : "";

  if (!transcript) {
    return undefined;
  }

  const detectedLanguage =
    typeof channel?.detected_language === "string"
      ? channel.detected_language
      : typeof channel?.language === "string"
        ? channel.language
        : undefined;
  const words = Array.isArray((alternative as { words?: unknown[] } | undefined)?.words)
    ? ((alternative as { words?: unknown[] }).words ?? [])
    : [];
  const segments = normalizeDeepgramSegments(words);

  return { transcript, detectedLanguage, segments };
}

const defaultClient = (apiKey: string): DeepgramListenClient => createDeepgramClient(apiKey).listen.prerecorded;

/**
 * Deepgram Nova, best value. SDK 4.x takes no per-request signal: on cancel or timeout pi-tube stops
 * waiting at once, but the HTTP request finishes in the background.
 */
export const createDeepgramProvider = (options: DeepgramProviderOptions = {}): SttProvider => {
  const model = options.model ?? "nova-3";
  const timeoutMs = options.timeoutMs ?? PROVIDER_REQUEST_TIMEOUT_MS;
  const createClient = options.createClient ?? defaultClient;

  return {
    id: "deepgram",
    capabilities: CLOUD_STT_CAPABILITIES,
    transcribe: (request, operation) =>
      runProviderCall({
        provider: "deepgram",
        request,
        options: operation,
        timeoutMs,
        call: (audio) => {
          const listenOptions: Record<string, unknown> = { model, smart_format: true };
          if (request.language) listenOptions.language = request.language;
          else listenOptions.detect_language = true;
          const client = createClient(request.apiKey);
          return audio.kind === "url"
            ? client.transcribeUrl({ url: audio.url }, listenOptions)
            : client.transcribeFile(audio.bytes, listenOptions);
        },
        interpret: (response) => {
          if (response.error) return err(mapProviderError("deepgram", response.error));
          const parsed = parseDeepgramResponse(response.result);
          return parsed ? ok(parsed) : err(invalidResponseError("deepgram"));
        },
      }),
  };
};
