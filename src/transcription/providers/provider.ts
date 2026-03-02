import type {
  TranscriptionProviderId,
  TranscriptionRequest,
  TranscriptionResult,
} from "../types.ts";

export interface TranscriptionProvider {
  readonly id: TranscriptionProviderId;
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>;
}
