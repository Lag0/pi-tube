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

export interface GroqProviderOptions {
  fetchImpl?: ProviderFetch;
  apiKey?: string;
  endpoint?: string;
  model?: string;
}

function sourceToGroqInput(source: ResolvedSource): { key: "url" | "file"; value: string | Blob } {
  if (source.kind === "local_file") {
    return { key: "file", value: Bun.file(source.absolutePath) };
  }

  return { key: "url", value: source.mediaUrl };
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

export function createGroqProvider(options: GroqProviderOptions = {}): TranscriptionProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? "https://api.groq.com/openai/v1/audio/transcriptions";
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

      const apiKey = options.apiKey ?? process.env.GROQ_API_KEY;
      if (!apiKey) {
        throw createTranscriptionProviderAuthError("groq", "missing GROQ_API_KEY");
      }

      const media = sourceToGroqInput(request.source);
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
            Authorization: `Bearer ${apiKey}`,
          },
          body,
        });
      } catch (error) {
        throw createTranscriptionProviderUnavailableError(
          "groq",
          error instanceof Error ? error.message : String(error),
        );
      }

      if (!response.ok) {
        const detail = (await response.text()).trim() || `status ${response.status}`;
        throw mapGroqHttpError(response.status, detail);
      }

      const payload = await response.json();
      const normalized = parseGroqResponse(payload);

      return {
        provider: "groq",
        transcript: normalized.transcript,
        requestedLanguage: request.requestedLanguage,
        detectedLanguage: normalized.detectedLanguage,
        segments: normalized.segments,
      };
    },
  };
}
