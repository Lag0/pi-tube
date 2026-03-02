import type { TranscriptionProviderId } from "../types.ts";
import { createDeepgramProvider } from "./deepgram.ts";
import { createGroqProvider } from "./groq.ts";
import type { TranscriptionProvider } from "./provider.ts";

export type ProviderRegistry = Partial<Record<TranscriptionProviderId, TranscriptionProvider>>;

export interface ProviderDefinition {
  id: TranscriptionProviderId;
  requiredEnv: string[];
}

export const TRANSCRIPTION_PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  { id: "deepgram", requiredEnv: ["DEEPGRAM_API_KEY"] },
  { id: "groq", requiredEnv: ["GROQ_API_KEY"] },
];

export function getDefaultProviderRegistry(): ProviderRegistry {
  return {
    deepgram: createDeepgramProvider(),
    groq: createGroqProvider(),
  };
}

export function resolveProvider(
  providerId: TranscriptionProviderId,
  providers: ProviderRegistry = getDefaultProviderRegistry(),
): TranscriptionProvider | undefined {
  return providers[providerId];
}
