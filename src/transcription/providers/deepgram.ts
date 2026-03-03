import { Buffer } from "node:buffer";
import { createClient, type DeepgramClientOptions } from "@deepgram/sdk";
import {
  CliError,
  createTranscriptionProviderAuthError,
  createTranscriptionProviderFailedError,
  createTranscriptionProviderInvalidResponseError,
  createTranscriptionProviderRateLimitError,
  createTranscriptionProviderUnavailableError,
} from "../../errors/cli-errors.ts";
import type {
  TranscriptionRequest,
  TranscriptionResult,
  TranscriptionSegment,
} from "../types.ts";
import type { TranscriptionProvider } from "./provider.ts";
import { prepareProviderMediaInput } from "./media-input.ts";

interface DeepgramSdkErrorLike {
  message?: string;
  status?: number;
}

interface DeepgramSdkResponse {
  result: unknown;
  error: DeepgramSdkErrorLike | null;
}

interface DeepgramListenClient {
  transcribeUrl(source: { url: string }, options?: Record<string, unknown>, endpoint?: string): Promise<DeepgramSdkResponse>;
  transcribeFile(source: Buffer, options?: Record<string, unknown>, endpoint?: string): Promise<DeepgramSdkResponse>;
}

export interface DeepgramProviderOptions {
  client?: DeepgramListenClient;
  apiKey?: string;
  clientOptions?: DeepgramClientOptions;
  endpoint?: string;
  model?: string;
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
    const text = typeof word.word === "string" ? word.word.trim() : typeof word.text === "string" ? word.text.trim() : "";
    if (!text) {
      continue;
    }

    const fromMilliseconds =
      typeof word.start_ms === "number" && Number.isFinite(word.start_ms) &&
      typeof word.end_ms === "number" && Number.isFinite(word.end_ms);
    const fromSeconds =
      typeof word.start === "number" && Number.isFinite(word.start) &&
      typeof word.end === "number" && Number.isFinite(word.end);

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

function parseDeepgramResponse(payload: unknown): {
  transcript: string;
  detectedLanguage?: string;
  segments?: TranscriptionSegment[];
} {
  if (!payload || typeof payload !== "object") {
    throw createTranscriptionProviderInvalidResponseError("deepgram");
  }

  const channel = (payload as { results?: { channels?: unknown[] } }).results?.channels?.[0] as
    | { alternatives?: unknown[]; detected_language?: unknown; language?: unknown }
    | undefined;
  const alternative = channel?.alternatives?.[0] as { transcript?: unknown } | undefined;
  const transcript = typeof alternative?.transcript === "string" ? alternative.transcript.trim() : "";

  if (!transcript) {
    throw createTranscriptionProviderInvalidResponseError("deepgram");
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

function mapDeepgramHttpError(status: number, detail: string): CliError {
  if (status === 401 || status === 403) {
    return createTranscriptionProviderAuthError("deepgram", detail);
  }

  if (status === 429) {
    return createTranscriptionProviderRateLimitError("deepgram", detail);
  }

  if (status === 502 || status === 503 || status === 504) {
    return createTranscriptionProviderUnavailableError("deepgram", detail);
  }

  return createTranscriptionProviderFailedError("deepgram", detail || `status ${status}`);
}

function extractStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && Number.isFinite(status) ? status : undefined;
}

function extractDetail(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return String(error);
}

function mapDeepgramSdkError(error: unknown): CliError {
  const status = extractStatus(error);
  const detail = extractDetail(error);

  if (typeof status === "number") {
    return mapDeepgramHttpError(status, detail);
  }

  return createTranscriptionProviderFailedError("deepgram", detail || "unknown Deepgram error");
}

function mapDeepgramThrownError(error: unknown): CliError {
  const status = extractStatus(error);
  const detail = extractDetail(error);

  if (typeof status === "number") {
    return mapDeepgramHttpError(status, detail);
  }

  return createTranscriptionProviderUnavailableError("deepgram", detail);
}

function createDeepgramListenClient(options: DeepgramProviderOptions): DeepgramListenClient {
  const apiKey = options.apiKey ?? process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw createTranscriptionProviderAuthError("deepgram", "missing DEEPGRAM_API_KEY");
  }

  const client = createClient(apiKey, options.clientOptions);
  return client.listen.prerecorded as DeepgramListenClient;
}

export function createDeepgramProvider(options: DeepgramProviderOptions = {}): TranscriptionProvider {
  const model = options.model ?? "nova-3";

  return {
    id: "deepgram",
    async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
      const mockResponse = process.env.PI_TUBE_TEST_DEEPGRAM_RESPONSE;
      if (mockResponse) {
        const payload = JSON.parse(mockResponse) as unknown;
        const normalized = parseDeepgramResponse(payload);
        return {
          provider: "deepgram",
          transcript: normalized.transcript,
          requestedLanguage: request.requestedLanguage,
          detectedLanguage: normalized.detectedLanguage,
          segments: normalized.segments,
        };
      }

      const mockError = process.env.PI_TUBE_TEST_DEEPGRAM_ERROR;
      if (mockError === "auth") {
        throw createTranscriptionProviderAuthError("deepgram", "mocked auth failure");
      }
      if (mockError === "rate_limit") {
        throw createTranscriptionProviderRateLimitError("deepgram", "mocked rate limit");
      }
      if (mockError === "unavailable") {
        throw createTranscriptionProviderUnavailableError("deepgram", "mocked unavailable");
      }
      if (mockError === "invalid_response") {
        throw createTranscriptionProviderInvalidResponseError("deepgram");
      }
      if (mockError === "failed") {
        throw createTranscriptionProviderFailedError("deepgram", "mocked provider failure");
      }

      const listenClient = options.client ?? createDeepgramListenClient(options);
      const media = await prepareProviderMediaInput(request.source, "deepgram");
      try {
        const transcriptionOptions: Record<string, unknown> = {
          model,
        };
        if (request.requestedLanguage) {
          transcriptionOptions.language = request.requestedLanguage;
        } else {
          transcriptionOptions.detect_language = true;
        }

        let response: DeepgramSdkResponse;
        try {
          if (media.key === "url") {
            response = await listenClient.transcribeUrl(
              { url: String(media.value) },
              transcriptionOptions,
              options.endpoint,
            );
          } else {
            const fileBuffer = Buffer.from(await media.value.arrayBuffer());
            response = await listenClient.transcribeFile(fileBuffer, transcriptionOptions, options.endpoint);
          }
        } catch (error) {
          throw mapDeepgramThrownError(error);
        }

        if (response.error) {
          throw mapDeepgramSdkError(response.error);
        }

        const normalized = parseDeepgramResponse(response.result);

        return {
          provider: "deepgram",
          transcript: normalized.transcript,
          requestedLanguage: request.requestedLanguage,
          detectedLanguage: normalized.detectedLanguage,
          segments: normalized.segments,
        };
      } catch (error) {
        if (error instanceof CliError) {
          throw error;
        }
        throw mapDeepgramThrownError(error);
      } finally {
        media.cleanup?.();
      }
    },
  };
}
