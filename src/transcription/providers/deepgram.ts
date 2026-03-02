import {
  CliError,
  createTranscriptionProviderAuthError,
  createTranscriptionProviderFailedError,
  createTranscriptionProviderInvalidResponseError,
  createTranscriptionProviderRateLimitError,
  createTranscriptionProviderUnavailableError,
} from "../../errors/cli-errors.ts";
import type { ResolvedSource } from "../../intake/types.ts";
import type {
  TranscriptionRequest,
  TranscriptionResult,
  TranscriptionSegment,
} from "../types.ts";
import type { TranscriptionProvider } from "./provider.ts";

type ProviderFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface DeepgramProviderOptions {
  fetchImpl?: ProviderFetch;
  apiKey?: string;
  endpoint?: string;
  model?: string;
}

function sourceToDeepgramInput(source: ResolvedSource): { key: "url" | "file"; value: string | Blob } {
  if (source.kind === "local_file") {
    return { key: "file", value: Bun.file(source.absolutePath) };
  }

  return { key: "url", value: source.mediaUrl };
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

export function createDeepgramProvider(options: DeepgramProviderOptions = {}): TranscriptionProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? "https://api.deepgram.com/v1/listen";
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

      const apiKey = options.apiKey ?? process.env.DEEPGRAM_API_KEY;
      if (!apiKey) {
        throw createTranscriptionProviderAuthError("deepgram", "missing DEEPGRAM_API_KEY");
      }

      const media = sourceToDeepgramInput(request.source);
      const body = new FormData();
      body.append(media.key, media.value);
      body.append("model", model);
      if (request.requestedLanguage) {
        body.append("language", request.requestedLanguage);
      }

      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Token ${apiKey}`,
          },
          body,
        });
      } catch (error) {
        throw createTranscriptionProviderUnavailableError(
          "deepgram",
          error instanceof Error ? error.message : String(error),
        );
      }

      if (!response.ok) {
        const detail = (await response.text()).trim() || `status ${response.status}`;
        throw mapDeepgramHttpError(response.status, detail);
      }

      const payload = await response.json();
      const normalized = parseDeepgramResponse(payload);

      return {
        provider: "deepgram",
        transcript: normalized.transcript,
        requestedLanguage: request.requestedLanguage,
        detectedLanguage: normalized.detectedLanguage,
        segments: normalized.segments,
      };
    },
  };
}
