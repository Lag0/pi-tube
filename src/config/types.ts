import type { TranscriptionProviderId } from "../transcription/types.ts";

export const CONFIG_VERSION = 1;

export interface ProviderCredentialConfig {
  api_key?: string;
  api_key_env?: string;
}

export interface PiTubeConfig {
  version: number;
  defaults: {
    provider?: TranscriptionProviderId;
    language?: string;
  };
  providers: {
    deepgram: ProviderCredentialConfig;
    groq: ProviderCredentialConfig;
  };
}

export const CONFIG_KEYS = [
  "defaults.provider",
  "defaults.language",
  "providers.deepgram.api_key",
  "providers.deepgram.api_key_env",
  "providers.groq.api_key",
  "providers.groq.api_key_env",
] as const;

export type ConfigKey = (typeof CONFIG_KEYS)[number];
