import type { ProviderDescriptor } from "../../core/domain/providers.ts";

/** Supported providers, in display order. Phase 1b attaches each `SttProvider` implementation here. */
export const PROVIDER_DESCRIPTORS: readonly ProviderDescriptor[] = [
  { id: "deepgram", positioning: "best_value", credentialEnvNames: ["DEEPGRAM_API_KEY"] },
  { id: "groq", positioning: "best_value", credentialEnvNames: ["GROQ_API_KEY"] },
  { id: "elevenlabs", positioning: "highest_accuracy", credentialEnvNames: ["ELEVENLABS_API_KEY", "ELEVEN_API_KEY"] },
];
