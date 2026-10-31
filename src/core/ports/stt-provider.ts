import type { OperationOptions } from "../domain/operation.ts";
import type { ProviderId } from "../domain/providers.ts";
import type { Result } from "../domain/result.ts";
import type { AudioInput } from "../domain/source.ts";
import type { TranscriptionSegment } from "../domain/transcript/types.ts";

/** What a provider supports, declared up front so callers never have to try and see. */
export interface SttCapabilities {
  readonly timestamps: boolean;
  readonly languageDetection: boolean;
  readonly requiresLanguage: boolean;
  readonly maxFileSizeBytes?: number;
  readonly offline: boolean;
}

/** One transcription call. The key comes from the credential resolver, never from the user's input. */
export interface SttRequest {
  readonly audio: AudioInput;
  readonly language?: string;
  readonly apiKey: string;
}

/** What a provider returns: the text, the detected language and timed segments (empty when unavailable). */
export interface SttTranscript {
  readonly text: string;
  readonly detectedLanguage?: string;
  readonly segments: readonly TranscriptionSegment[];
}

/** A speech-to-text provider. Adding one is a new implementation plus a registry entry. */
export interface SttProvider {
  readonly id: ProviderId;
  /** The model this provider calls; part of the transcript's library key. */
  readonly model: string;
  readonly capabilities: SttCapabilities;
  transcribe(request: SttRequest, options?: OperationOptions): Promise<Result<SttTranscript>>;
}
