import type { ProviderDescriptor } from "../../core/domain/providers.ts";
import type { SttProvider } from "../../core/ports/stt-provider.ts";
import { createDeepgramProvider } from "./deepgram.ts";
import { createElevenLabsProvider } from "./elevenlabs.ts";
import { createGroqProvider } from "./groq.ts";

/** Supported providers, in display order. Phase 1b attaches each `SttProvider` implementation here. */
export const PROVIDER_DESCRIPTORS: readonly ProviderDescriptor[] = [
  { id: "deepgram", positioning: "best_value", credentialEnvNames: ["DEEPGRAM_API_KEY"] },
  { id: "groq", positioning: "best_value", credentialEnvNames: ["GROQ_API_KEY"] },
  { id: "elevenlabs", positioning: "highest_accuracy", credentialEnvNames: ["ELEVENLABS_API_KEY", "ELEVEN_API_KEY"] },
];

/** One `SttProvider` per entry of `PROVIDER_DESCRIPTORS`, keyed by id. */
export const createSttProviders = (): Readonly<Record<string, SttProvider>> => ({
  deepgram: createDeepgramProvider(),
  groq: createGroqProvider(),
  elevenlabs: createElevenLabsProvider(),
});
