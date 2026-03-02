import {
  CliError,
  createTranscriptionProviderNotConfiguredError,
} from "../errors/cli-errors.ts";
import { readConfig } from "../config/store.ts";
import type { PiTubeConfig } from "../config/types.ts";
import type { ResolvedSource } from "../intake/types.ts";
import {
  getDefaultProviderRegistry,
  resolveProvider,
  type ProviderRegistry,
} from "./providers/index.ts";
import type {
  TranscriptionExecutionResult,
  TranscriptionProviderId,
} from "./types.ts";

export const DEFAULT_TRANSCRIPTION_PROVIDER: TranscriptionProviderId = "deepgram";
export const TRANSCRIPTION_PROVIDER_ENV = "PI_TUBE_TRANSCRIPTION_PROVIDER";
export const TRANSCRIPTION_LANGUAGE_ENV = "PI_TUBE_TRANSCRIPTION_LANGUAGE";

export interface TranscriptionServiceOptions {
  provider?: string;
  language?: string;
  env?: Record<string, string | undefined>;
  providers?: ProviderRegistry;
  config?: PiTubeConfig;
}

function parseProviderId(value: string): TranscriptionProviderId {
  if (value === "deepgram" || value === "groq") {
    return value;
  }

  throw new CliError(`Unsupported transcription provider: \`${value}\`.`, {
    code: "TRANSCRIPTION_PROVIDER_INVALID",
    exitCode: 2,
    guidance: [
      "Use `deepgram` or `groq`.",
      "Set provider through `--provider` or PI_TUBE_TRANSCRIPTION_PROVIDER.",
    ],
  });
}

export function selectTranscriptionProvider(options: {
  provider?: string;
  config?: PiTubeConfig;
  env?: Record<string, string | undefined>;
} = {}): TranscriptionProviderId {
  const fromCli = options.provider?.trim().toLowerCase();
  if (fromCli) {
    return parseProviderId(fromCli);
  }

  const fromConfig = options.config?.defaults.provider?.trim().toLowerCase();
  if (fromConfig) {
    return parseProviderId(fromConfig);
  }

  const fromEnv = options.env?.[TRANSCRIPTION_PROVIDER_ENV]?.trim().toLowerCase();
  if (fromEnv) {
    return parseProviderId(fromEnv);
  }

  return DEFAULT_TRANSCRIPTION_PROVIDER;
}

function normalizeLanguage(language?: string): string | undefined {
  const normalized = language?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function resolveProviderApiKey(
  providerId: TranscriptionProviderId,
  config: PiTubeConfig,
  env: Record<string, string | undefined>,
): string | undefined {
  const providerConfig = config.providers[providerId];
  const fromConfig = providerConfig.api_key?.trim();
  if (fromConfig) {
    return fromConfig;
  }

  const fromReferencedEnvName = providerConfig.api_key_env?.trim();
  if (fromReferencedEnvName) {
    const referencedValue = env[fromReferencedEnvName]?.trim();
    if (referencedValue) {
      return referencedValue;
    }
  }

  const defaultEnvKey = providerId === "deepgram" ? "DEEPGRAM_API_KEY" : "GROQ_API_KEY";
  const fromDefaultEnv = env[defaultEnvKey]?.trim();
  return fromDefaultEnv && fromDefaultEnv.length > 0 ? fromDefaultEnv : undefined;
}

export async function transcribeFromResolvedSource(
  source: ResolvedSource,
  options: TranscriptionServiceOptions = {},
): Promise<TranscriptionExecutionResult> {
  const env = options.env ?? process.env;
  const config = options.config ?? readConfig({ env });
  const providerId = selectTranscriptionProvider({ provider: options.provider, config, env });
  const requestedLanguage = normalizeLanguage(
    options.language ?? config.defaults.language ?? env[TRANSCRIPTION_LANGUAGE_ENV],
  );
  const registry =
    options.providers ??
    getDefaultProviderRegistry({
      credentials: {
        deepgram: { apiKey: resolveProviderApiKey("deepgram", config, env) },
        groq: { apiKey: resolveProviderApiKey("groq", config, env) },
      },
    });
  const provider = resolveProvider(providerId, registry);

  if (!provider) {
    throw createTranscriptionProviderNotConfiguredError(providerId);
  }

  const result = await provider.transcribe({ source, requestedLanguage });

  return {
    source,
    provider: result.provider,
    transcript: result.transcript,
    requestedLanguage: result.requestedLanguage ?? requestedLanguage,
    detectedLanguage: result.detectedLanguage,
    segments: result.segments,
  };
}
