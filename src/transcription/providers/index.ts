import type { TranscriptionProviderId } from "../types.ts";
import { createDeepgramProvider } from "./deepgram.ts";
import { createGroqProvider } from "./groq.ts";
import type { TranscriptionProvider } from "./provider.ts";

export type ProviderRegistry = Partial<Record<TranscriptionProviderId, TranscriptionProvider>>;

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
