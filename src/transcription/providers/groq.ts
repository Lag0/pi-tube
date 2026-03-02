import {
  CliError,
  createTranscriptionProviderAuthError,
  createTranscriptionProviderFailedError,
  createTranscriptionProviderInvalidResponseError,
  createTranscriptionProviderRateLimitError,
  createTranscriptionProviderUnavailableError,
} from "../../errors/cli-errors.ts";
import type { ResolvedSource } from "../../intake/types.ts";
import type { TranscriptionRequest, TranscriptionResult } from "../types.ts";
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

function parseGroqResponse(payload: unknown): { transcript: string; detectedLanguage?: string } {
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

  return { transcript: text, detectedLanguage };
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
      };
    },
  };
}
