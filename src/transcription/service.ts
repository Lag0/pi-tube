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

const FALLBACK_ELIGIBLE_ERRORS = new Set([
  "TRANSCRIPTION_PROVIDER_AUTH",
  "TRANSCRIPTION_PROVIDER_RATE_LIMIT",
  "TRANSCRIPTION_PROVIDER_UNAVAILABLE",
  "TRANSCRIPTION_PROVIDER_FAILED",
  "TRANSCRIPTION_PROVIDER_INVALID_RESPONSE",
]);

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

function fallbackProviderFor(providerId: TranscriptionProviderId): TranscriptionProviderId {
  return providerId === "deepgram" ? "groq" : "deepgram";
}

function hasProviderMockOverride(
  providerId: TranscriptionProviderId,
  env: Record<string, string | undefined>,
): boolean {
  if (providerId === "deepgram") {
    return Boolean(env.PI_TUBE_TEST_DEEPGRAM_RESPONSE || env.PI_TUBE_TEST_DEEPGRAM_ERROR);
  }

  return Boolean(env.PI_TUBE_TEST_GROQ_RESPONSE || env.PI_TUBE_TEST_GROQ_ERROR);
}

function hasProviderCandidate(
  providerId: TranscriptionProviderId,
  providers: ProviderRegistry,
): boolean {
  return Boolean(providers[providerId]);
}

function isFallbackEligibleError(error: unknown): boolean {
  return error instanceof CliError && FALLBACK_ELIGIBLE_ERRORS.has(error.code);
}

async function transcribeWithProvider(
  source: ResolvedSource,
  providerId: TranscriptionProviderId,
  providers: ProviderRegistry,
  requestedLanguage?: string,
): Promise<TranscriptionExecutionResult> {
  const provider = resolveProvider(providerId, providers);
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

export async function transcribeFromResolvedSource(
  source: ResolvedSource,
  options: TranscriptionServiceOptions = {},
): Promise<TranscriptionExecutionResult> {
  const env = options.env ?? process.env;
  const config = options.config ?? readConfig({ env });
  const selectedProviderId = selectTranscriptionProvider({ provider: options.provider, config, env });
  const alternateProviderId = fallbackProviderFor(selectedProviderId);
  const requestedLanguage = normalizeLanguage(
    options.language ?? config.defaults.language ?? env[TRANSCRIPTION_LANGUAGE_ENV],
  );
  const credentialMap: Record<TranscriptionProviderId, string | undefined> = {
    deepgram: resolveProviderApiKey("deepgram", config, env),
    groq: resolveProviderApiKey("groq", config, env),
  };
  const registry =
    options.providers ??
    getDefaultProviderRegistry({
      credentials: {
        deepgram: { apiKey: credentialMap.deepgram },
        groq: { apiKey: credentialMap.groq },
      },
    });
  const usingInjectedProviders = options.providers !== undefined;

  const providerConfigured = (providerId: TranscriptionProviderId): boolean => {
    return Boolean(
      credentialMap[providerId] ||
      hasProviderMockOverride(providerId, env) ||
      (usingInjectedProviders && hasProviderCandidate(providerId, registry)),
    );
  };

  const selectedConfigured = providerConfigured(selectedProviderId);
  const alternateConfigured = providerConfigured(alternateProviderId);

  if (!selectedConfigured && !alternateConfigured) {
    throw new CliError("No transcription provider is configured with credentials.", {
      code: "TRANSCRIPTION_PROVIDER_NOT_CONFIGURED",
      exitCode: 2,
      guidance: [
        "Configure at least one provider credential (`pi-tube auth login <provider>`).",
        "Run `pi-tube auth status` to inspect missing credentials.",
      ],
    });
  }

  const primaryProviderId = selectedConfigured ? selectedProviderId : alternateProviderId;
  const shouldTryAlternate =
    alternateConfigured &&
    alternateProviderId !== primaryProviderId;

  try {
    return await transcribeWithProvider(source, primaryProviderId, registry, requestedLanguage);
  } catch (error) {
    if (!shouldTryAlternate || !isFallbackEligibleError(error)) {
      throw error;
    }

    return transcribeWithProvider(source, alternateProviderId, registry, requestedLanguage);
  }
}
