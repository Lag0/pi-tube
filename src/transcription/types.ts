import type { ResolvedSource } from "../intake/types.ts";

export type TranscriptionProviderId = "deepgram" | "groq";

export interface TranscriptionSegment {
  startMs: number;
  endMs: number;
  text: string;
}

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

export interface TranscriptionExecutionResult {
  source: ResolvedSource;
  provider: TranscriptionProviderId;
  transcript: string;
  requestedLanguage?: string;
  detectedLanguage?: string;
  segments?: TranscriptionSegment[];
}
