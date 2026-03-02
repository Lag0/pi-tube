import type { ResolvedSource } from "../intake/types.ts";

export type TranscriptionProviderId = "deepgram" | "groq";

export interface TranscriptionRequest {
  source: ResolvedSource;
  requestedLanguage?: string;
}

export interface TranscriptionResult {
  provider: TranscriptionProviderId;
  transcript: string;
  requestedLanguage?: string;
  detectedLanguage?: string;
}

export interface TranscriptionExecutionResult {
  source: ResolvedSource;
  provider: TranscriptionProviderId;
  transcript: string;
  requestedLanguage?: string;
  detectedLanguage?: string;
}
