import { DeepgramClient } from "@deepgram/sdk";
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

/** What pi-tube sends with every request: a subset of the SDK's request fields. */
interface DeepgramListenOptions {
  readonly model: string;
  readonly smart_format: boolean;
  readonly language?: string;
  readonly detect_language?: boolean;
}

/** SDK 5.x per-request options; `abortSignal` cancels the HTTP request itself. */
interface DeepgramRequestOptions {
  readonly abortSignal: AbortSignal;
  readonly timeoutInSeconds: number;
  readonly maxRetries: number;
}

/** The part of `client.listen.v1.media` pi-tube uses. HTTP failures are thrown as `DeepgramError` with `statusCode`. */
interface DeepgramListenClient {
  transcribeUrl(
    request: DeepgramListenOptions & { readonly url: string },
    options: DeepgramRequestOptions,
  ): Promise<unknown>;
  transcribeFile(file: Buffer, request: DeepgramListenOptions, options: DeepgramRequestOptions): Promise<unknown>;
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

const defaultClient = (apiKey: string): DeepgramListenClient => new DeepgramClient({ apiKey }).listen.v1.media;

/** Deepgram Nova, best value. The SDK honors the signal, the per-request timeout and the retry count. */
export const createDeepgramProvider = (options: DeepgramProviderOptions = {}): SttProvider => {
  const model = options.model ?? "nova-3";
  const timeoutMs = options.timeoutMs ?? PROVIDER_REQUEST_TIMEOUT_MS;
  const createClient = options.createClient ?? defaultClient;

  return {
    id: "deepgram",
    model,
    capabilities: CLOUD_STT_CAPABILITIES,
    transcribe: (request, operation) =>
      runProviderCall({
        provider: "deepgram",
        request,
        options: operation,
        timeoutMs,
        call: (audio, signal) => {
          const listenOptions: DeepgramListenOptions = request.language
            ? { model, smart_format: true, language: request.language }
            : { model, smart_format: true, detect_language: true };
          const requestOptions: DeepgramRequestOptions = {
            abortSignal: signal,
            timeoutInSeconds: timeoutMs / 1000,
            maxRetries: 2,
          };
          const client = createClient(request.apiKey);
          return audio.kind === "url"
            ? client.transcribeUrl({ ...listenOptions, url: audio.url }, requestOptions)
            : client.transcribeFile(audio.bytes, listenOptions, requestOptions);
        },
        interpret: (response) => {
          const parsed = parseDeepgramResponse(response);
          return parsed ? ok(parsed) : err(invalidResponseError("deepgram"));
        },
      }),
  };
};
