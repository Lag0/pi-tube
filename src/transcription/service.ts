import type { EnvironmentVariables, PiTubeConfig } from "../core/domain/config.ts";
import { resolveCredential } from "../core/domain/providers.ts";
import { CliError, createTranscriptionProviderNotConfiguredError } from "../errors/cli-errors.ts";
import { PROVIDER_DESCRIPTORS } from "../infrastructure/stt/registry.ts";
import type { ResolvedSource } from "../intake/types.ts";
import { getDefaultProviderRegistry, type ProviderRegistry, resolveProvider } from "./providers/index.ts";
import type { TranscriptionExecutionResult, TranscriptionProviderId } from "./types.ts";

export const DEFAULT_TRANSCRIPTION_PROVIDER: TranscriptionProviderId = "deepgram";
export const TRANSCRIPTION_PROVIDER_ENV = "PI_TUBE_TRANSCRIPTION_PROVIDER";
export const TRANSCRIPTION_LANGUAGE_ENV = "PI_TUBE_TRANSCRIPTION_LANGUAGE";

export interface TranscriptionServiceOptions {
  provider?: string;
  language?: string;
  env?: EnvironmentVariables;
  providers?: ProviderRegistry;
  config: PiTubeConfig;
}

const FALLBACK_ELIGIBLE_ERRORS = new Set([
  "PROVIDER_AUTH",
  "PROVIDER_RATE_LIMIT",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_FAILED",
  "PROVIDER_INVALID_RESPONSE",
]);

const PROVIDER_FALLBACK_ORDER: TranscriptionProviderId[] = ["deepgram", "groq", "elevenlabs"];

function parseProviderId(value: string): TranscriptionProviderId {
  if (value === "deepgram" || value === "groq" || value === "elevenlabs") {
    return value;
  }

  throw new CliError(`Unsupported transcription provider: \`${value}\`.`, {
    code: "PROVIDER_INVALID",
    guidance: [
      "Use one of: `deepgram`, `groq`, `elevenlabs`.",
      "Set provider through `--provider` or PI_TUBE_TRANSCRIPTION_PROVIDER.",
    ],
  });
}

export function selectTranscriptionProvider(
  options: { provider?: string; config?: PiTubeConfig; env?: EnvironmentVariables } = {},
): TranscriptionProviderId {
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
  env: EnvironmentVariables,
): string | undefined {
  const descriptor = PROVIDER_DESCRIPTORS.find((candidate) => candidate.id === providerId);
  return descriptor ? resolveCredential(descriptor, config, env).apiKey : undefined;
}

function fallbackProvidersFor(providerId: TranscriptionProviderId): TranscriptionProviderId[] {
  return PROVIDER_FALLBACK_ORDER.filter((candidate) => candidate !== providerId);
}

function hasProviderMockOverride(providerId: TranscriptionProviderId, env: EnvironmentVariables): boolean {
  if (providerId === "deepgram") {
    return Boolean(env.PI_TUBE_TEST_DEEPGRAM_RESPONSE || env.PI_TUBE_TEST_DEEPGRAM_ERROR);
  }

  if (providerId === "groq") {
    return Boolean(env.PI_TUBE_TEST_GROQ_RESPONSE || env.PI_TUBE_TEST_GROQ_ERROR);
  }

  return Boolean(env.PI_TUBE_TEST_ELEVENLABS_RESPONSE || env.PI_TUBE_TEST_ELEVENLABS_ERROR);
}

function hasProviderCandidate(providerId: TranscriptionProviderId, providers: ProviderRegistry): boolean {
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
  options: TranscriptionServiceOptions,
): Promise<TranscriptionExecutionResult> {
  const env = options.env ?? process.env;
  const { config } = options;
  const selectedProviderId = selectTranscriptionProvider({ provider: options.provider, config, env });
  const requestedLanguage = normalizeLanguage(
    options.language ?? config.defaults.language ?? env[TRANSCRIPTION_LANGUAGE_ENV],
  );
  const credentialMap: Record<TranscriptionProviderId, string | undefined> = {
    deepgram: resolveProviderApiKey("deepgram", config, env),
    groq: resolveProviderApiKey("groq", config, env),
    elevenlabs: resolveProviderApiKey("elevenlabs", config, env),
  };
  const registry =
    options.providers ??
    getDefaultProviderRegistry({
      credentials: {
        deepgram: { apiKey: credentialMap.deepgram },
        groq: { apiKey: credentialMap.groq },
        elevenlabs: { apiKey: credentialMap.elevenlabs },
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

  const candidates = [selectedProviderId, ...fallbackProvidersFor(selectedProviderId)].filter((providerId) =>
    providerConfigured(providerId),
  );

  if (candidates.length === 0) {
    throw new CliError("No transcription provider is configured with credentials.", {
      code: "PROVIDER_NOT_CONFIGURED",
      guidance: [
        "Configure at least one provider credential (`pi-tube auth login <provider>`).",
        "Run `pi-tube auth status` to inspect missing credentials.",
      ],
    });
  }

  let lastError: unknown;
  for (const [index, providerId] of candidates.entries()) {
    try {
      return await transcribeWithProvider(source, providerId, registry, requestedLanguage);
    } catch (error) {
      lastError = error;
      const hasNextCandidate = index < candidates.length - 1;
      if (!hasNextCandidate || !isFallbackEligibleError(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}
