import Groq from "groq-sdk";
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

type ProviderFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface GroqAudioTranscriptionClient {
  create(payload: Record<string, unknown>): Promise<unknown>;
}

export interface GroqProviderOptions {
  client?: GroqAudioTranscriptionClient;
  fetchImpl?: ProviderFetch;
  apiKey?: string;
  baseURL?: string;
  endpoint?: string;
  model?: string;
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
      typeof segment.start_ms === "number" && Number.isFinite(segment.start_ms) &&
      typeof segment.end_ms === "number" && Number.isFinite(segment.end_ms);
    const fromSeconds =
      typeof segment.start === "number" && Number.isFinite(segment.start) &&
      typeof segment.end === "number" && Number.isFinite(segment.end);

    if (!fromMilliseconds && !fromSeconds) {
      continue;
    }

    const startMs = fromMilliseconds
      ? Math.round(segment.start_ms as number)
      : Math.round((segment.start as number) * 1000);
    const endMs = fromMilliseconds
      ? Math.round(segment.end_ms as number)
      : Math.round((segment.end as number) * 1000);

    if (endMs < startMs) {
      continue;
    }

    segments.push({ startMs, endMs, text });
  }

  return segments.length > 0 ? segments : undefined;
}

function parseGroqResponse(payload: unknown): {
  transcript: string;
  detectedLanguage?: string;
  segments?: TranscriptionSegment[];
} {
  if (!payload || typeof payload !== "object") {
    throw createTranscriptionProviderInvalidResponseError("groq");
  }

  const text = typeof (payload as { text?: unknown }).text === "string" ? (payload as { text: string }).text.trim() : "";
  if (!text) {
    throw createTranscriptionProviderInvalidResponseError("groq");
  }

  const detectedLanguage =
    typeof (payload as { language?: unknown }).language === "string"
      ? ((payload as { language: string }).language || undefined)
      : undefined;
  const rawSegments = Array.isArray((payload as { segments?: unknown[] }).segments)
    ? ((payload as { segments?: unknown[] }).segments ?? [])
    : [];
  const segments = normalizeGroqSegments(rawSegments);

  return { transcript: text, detectedLanguage, segments };
}

function mapGroqHttpError(status: number, detail: string): CliError {
  if (status === 401 || status === 403) {
    return createTranscriptionProviderAuthError("groq", detail);
  }

  if (status === 429) {
    return createTranscriptionProviderRateLimitError("groq", detail);
  }

  if (status === 502 || status === 503 || status === 504) {
    return createTranscriptionProviderUnavailableError("groq", detail);
  }

  if (status === 400 || status === 422) {
    return createTranscriptionProviderInvalidResponseError("groq");
  }

  return createTranscriptionProviderFailedError("groq", detail || `status ${status}`);
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

function resolveBaseUrl(options: GroqProviderOptions): string | undefined {
  if (options.baseURL) {
    return options.baseURL;
  }

  if (!options.endpoint) {
    return undefined;
  }

  try {
    const parsed = new URL(options.endpoint);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return undefined;
  }
}

function createGroqTranscriptionClient(options: GroqProviderOptions): GroqAudioTranscriptionClient {
  const apiKey = options.apiKey ?? process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw createTranscriptionProviderAuthError("groq", "missing GROQ_API_KEY");
  }

  const client = new Groq({
    apiKey,
    baseURL: resolveBaseUrl(options),
    fetch: options.fetchImpl,
  });

  return client.audio.transcriptions as GroqAudioTranscriptionClient;
}

export function createGroqProvider(options: GroqProviderOptions = {}): TranscriptionProvider {
  const model = options.model ?? "whisper-large-v3";

  return {
    id: "groq",
    async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
      const mockResponse = process.env.PI_TUBE_TEST_GROQ_RESPONSE;
      if (mockResponse) {
        const payload = JSON.parse(mockResponse) as unknown;
        const normalized = parseGroqResponse(payload);
        return {
          provider: "groq",
          transcript: normalized.transcript,
          requestedLanguage: request.requestedLanguage,
          detectedLanguage: normalized.detectedLanguage,
          segments: normalized.segments,
        };
      }

      const mockError = process.env.PI_TUBE_TEST_GROQ_ERROR;
      if (mockError === "auth") {
        throw createTranscriptionProviderAuthError("groq", "mocked auth failure");
      }
      if (mockError === "rate_limit") {
        throw createTranscriptionProviderRateLimitError("groq", "mocked rate limit");
      }
      if (mockError === "unavailable") {
        throw createTranscriptionProviderUnavailableError("groq", "mocked unavailable");
      }
      if (mockError === "invalid_response") {
        throw createTranscriptionProviderInvalidResponseError("groq");
      }
      if (mockError === "failed") {
        throw createTranscriptionProviderFailedError("groq", "mocked provider failure");
      }

      const transcriptionClient = options.client ?? createGroqTranscriptionClient(options);
      const media = await prepareProviderMediaInput(request.source, "groq");
      try {
        const payload: Record<string, unknown> = {
          model,
          response_format: "verbose_json",
          timestamp_granularities: ["segment", "word"],
        };
        if (request.requestedLanguage) {
          payload.language = request.requestedLanguage;
        }
        if (media.key === "url") {
          payload.url = String(media.value);
        } else {
          payload.file = media.value;
        }

        let response: unknown;
        try {
          response = await transcriptionClient.create(payload);
        } catch (error) {
          const status = extractStatus(error);
          const detail = extractDetail(error);
          if (typeof status === "number") {
            throw mapGroqHttpError(status, detail);
          }
          throw createTranscriptionProviderUnavailableError("groq", detail);
        }

        const normalized = parseGroqResponse(response);

        return {
          provider: "groq",
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
