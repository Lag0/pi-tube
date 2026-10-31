import type { ProviderId } from "../providers.ts";
import type { ResolvedSource } from "../source.ts";

/** A timed piece of a transcript, in milliseconds. */
export interface TranscriptionSegment {
  startMs: number;
  endMs: number;
  text: string;
}

/** Everything a transcription produced, before it is rendered and saved. */
export interface TranscriptionExecutionResult {
  source: ResolvedSource;
  provider: ProviderId;
  transcript: string;
  requestedLanguage?: string;
  detectedLanguage?: string;
  segments?: TranscriptionSegment[];
}
