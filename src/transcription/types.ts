import type { ResolvedSource } from "../core/domain/source.ts";
import type { TranscriptionSegment } from "../core/domain/transcript/types.ts";

export type { TranscriptionExecutionResult, TranscriptionSegment } from "../core/domain/transcript/types.ts";

export type TranscriptionProviderId = "deepgram" | "groq" | "elevenlabs";

export interface TranscriptionRequest {
  source: ResolvedSource;
  requestedLanguage?: string;
}

export interface TranscriptionResult {
  provider: TranscriptionProviderId;
  transcript: string;
  requestedLanguage?: string;
  detectedLanguage?: string;
  segments?: TranscriptionSegment[];
}
