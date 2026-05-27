import type { TranscriptionProviderId } from "../types.ts";
import { createDeepgramProvider } from "./deepgram.ts";
import { createGroqProvider } from "./groq.ts";
import { createElevenLabsProvider } from "./elevenlabs.ts";
import type { TranscriptionProvider } from "./provider.ts";

export type ProviderRegistry = Partial<Record<TranscriptionProviderId, TranscriptionProvider>>;

export interface ProviderDefinition {
  id: TranscriptionProviderId;
  requiredEnv: string[];
}

interface ProviderCredentialOverride {
  apiKey?: string;
}

export interface DefaultProviderRegistryOptions {
  credentials?: Partial<Record<TranscriptionProviderId, ProviderCredentialOverride>>;
}

export const TRANSCRIPTION_PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  { id: "deepgram", requiredEnv: ["DEEPGRAM_API_KEY"] },
  { id: "groq", requiredEnv: ["GROQ_API_KEY"] },
  { id: "elevenlabs", requiredEnv: ["ELEVENLABS_API_KEY", "ELEVEN_API_KEY"] },
];

export function getDefaultProviderRegistry(
  options: DefaultProviderRegistryOptions = {},
): ProviderRegistry {
  return {
    deepgram: createDeepgramProvider({ apiKey: options.credentials?.deepgram?.apiKey }),
    groq: createGroqProvider({ apiKey: options.credentials?.groq?.apiKey }),
    elevenlabs: createElevenLabsProvider({ apiKey: options.credentials?.elevenlabs?.apiKey }),
  };
}

export function resolveProvider(
  providerId: TranscriptionProviderId,
  providers: ProviderRegistry = getDefaultProviderRegistry(),
): TranscriptionProvider | undefined {
  return providers[providerId];
}
