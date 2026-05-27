import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
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

interface ElevenLabsSpeechToTextPayload {
  modelId: string;
  file?: Blob;
  sourceUrl?: string;
  languageCode?: string;
  timestampsGranularity?: "word" | "character";
  tagAudioEvents?: boolean;
}

interface ElevenLabsSpeechToTextClient {
  convert(payload: ElevenLabsSpeechToTextPayload): Promise<unknown>;
}

export interface ElevenLabsProviderOptions {
  client?: ElevenLabsSpeechToTextClient;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  model?: string;
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
      typeof word.start !== "number" || !Number.isFinite(word.start) ||
      typeof word.end !== "number" || !Number.isFinite(word.end)
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

function parseElevenLabsResponse(payload: unknown): {
  transcript: string;
  detectedLanguage?: string;
  segments?: TranscriptionSegment[];
} {
  if (!payload || typeof payload !== "object") {
    throw createTranscriptionProviderInvalidResponseError("elevenlabs");
  }

  const text = typeof (payload as { text?: unknown }).text === "string"
    ? (payload as { text: string }).text.trim()
    : "";
  if (!text) {
    throw createTranscriptionProviderInvalidResponseError("elevenlabs");
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

function extractStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const status = (error as { status?: unknown }).status;
  if (typeof status === "number" && Number.isFinite(status)) {
    return status;
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === "number" && Number.isFinite(statusCode) ? statusCode : undefined;
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

function mapElevenLabsHttpError(status: number, detail: string): CliError {
  if (status === 401 || status === 403) {
    return createTranscriptionProviderAuthError("elevenlabs", detail);
  }

  if (status === 429) {
    return createTranscriptionProviderRateLimitError("elevenlabs", detail);
  }

  if (status === 502 || status === 503 || status === 504) {
    return createTranscriptionProviderUnavailableError("elevenlabs", detail);
  }

  if (status === 400 || status === 422) {
    return createTranscriptionProviderInvalidResponseError("elevenlabs");
  }

  return createTranscriptionProviderFailedError("elevenlabs", detail || `status ${status}`);
}

function createElevenLabsSpeechToTextClient(options: ElevenLabsProviderOptions): ElevenLabsSpeechToTextClient {
  const apiKey = options.apiKey ?? process.env.ELEVENLABS_API_KEY ?? process.env.ELEVEN_API_KEY;
  if (!apiKey) {
    throw createTranscriptionProviderAuthError("elevenlabs", "missing ELEVENLABS_API_KEY");
  }

  const client = new ElevenLabsClient({
    apiKey,
    baseUrl: options.baseUrl,
    fetch: options.fetchImpl,
  });

  return client.speechToText as ElevenLabsSpeechToTextClient;
}

export function createElevenLabsProvider(options: ElevenLabsProviderOptions = {}): TranscriptionProvider {
  const model = options.model ?? "scribe_v2";

  return {
    id: "elevenlabs",
    async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
      const mockResponse = process.env.PI_TUBE_TEST_ELEVENLABS_RESPONSE;
      if (mockResponse) {
        const payload = JSON.parse(mockResponse) as unknown;
        const normalized = parseElevenLabsResponse(payload);
        return {
          provider: "elevenlabs",
          transcript: normalized.transcript,
          requestedLanguage: request.requestedLanguage,
          detectedLanguage: normalized.detectedLanguage,
          segments: normalized.segments,
        };
      }

      const mockError = process.env.PI_TUBE_TEST_ELEVENLABS_ERROR;
      if (mockError === "auth") {
        throw createTranscriptionProviderAuthError("elevenlabs", "mocked auth failure");
      }
      if (mockError === "rate_limit") {
        throw createTranscriptionProviderRateLimitError("elevenlabs", "mocked rate limit");
      }
      if (mockError === "unavailable") {
        throw createTranscriptionProviderUnavailableError("elevenlabs", "mocked unavailable");
      }
      if (mockError === "invalid_response") {
        throw createTranscriptionProviderInvalidResponseError("elevenlabs");
      }
      if (mockError === "failed") {
        throw createTranscriptionProviderFailedError("elevenlabs", "mocked provider failure");
      }

      const speechToTextClient = options.client ?? createElevenLabsSpeechToTextClient(options);
      const media = await prepareProviderMediaInput(request.source, "elevenlabs");
      try {
        const payload: ElevenLabsSpeechToTextPayload = {
          modelId: model,
          timestampsGranularity: "word",
          tagAudioEvents: true,
        };
        if (request.requestedLanguage) {
          payload.languageCode = request.requestedLanguage;
        }
        if (media.key === "url") {
          payload.sourceUrl = String(media.value);
        } else {
          payload.file = media.value as Blob;
        }

        let response: unknown;
        try {
          response = await speechToTextClient.convert(payload);
        } catch (error) {
          const status = extractStatus(error);
          const detail = extractDetail(error);
          if (typeof status === "number") {
            throw mapElevenLabsHttpError(status, detail);
          }
          throw createTranscriptionProviderUnavailableError("elevenlabs", detail);
        }

        const normalized = parseElevenLabsResponse(response);

        return {
          provider: "elevenlabs",
          transcript: normalized.transcript,
          requestedLanguage: request.requestedLanguage,
          detectedLanguage: normalized.detectedLanguage,
          segments: normalized.segments,
        };
      } finally {
        media.cleanup?.();
      }
    },
  };
}
