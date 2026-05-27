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

const PROVIDER_FALLBACK_ORDER: TranscriptionProviderId[] = ["deepgram", "groq", "elevenlabs"];

function parseProviderId(value: string): TranscriptionProviderId {
  if (value === "deepgram" || value === "groq" || value === "elevenlabs") {
    return value;
  }

  throw new CliError(`Unsupported transcription provider: \`${value}\`.`, {
    code: "TRANSCRIPTION_PROVIDER_INVALID",
    exitCode: 2,
    guidance: [
      "Use one of: `deepgram`, `groq`, `elevenlabs`.",
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

  const defaultEnvKeys = providerId === "deepgram"
    ? ["DEEPGRAM_API_KEY"]
    : providerId === "groq"
      ? ["GROQ_API_KEY"]
      : ["ELEVENLABS_API_KEY", "ELEVEN_API_KEY"];
  for (const envKey of defaultEnvKeys) {
    const fromDefaultEnv = env[envKey]?.trim();
    if (fromDefaultEnv) {
      return fromDefaultEnv;
    }
  }
  return undefined;
}

function fallbackProvidersFor(providerId: TranscriptionProviderId): TranscriptionProviderId[] {
  return PROVIDER_FALLBACK_ORDER.filter((candidate) => candidate !== providerId);
}

function hasProviderMockOverride(
  providerId: TranscriptionProviderId,
  env: Record<string, string | undefined>,
): boolean {
  if (providerId === "deepgram") {
    return Boolean(env.PI_TUBE_TEST_DEEPGRAM_RESPONSE || env.PI_TUBE_TEST_DEEPGRAM_ERROR);
  }

  if (providerId === "groq") {
    return Boolean(env.PI_TUBE_TEST_GROQ_RESPONSE || env.PI_TUBE_TEST_GROQ_ERROR);
  }

  return Boolean(env.PI_TUBE_TEST_ELEVENLABS_RESPONSE || env.PI_TUBE_TEST_ELEVENLABS_ERROR);
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

  const candidates = [selectedProviderId, ...fallbackProvidersFor(selectedProviderId)]
    .filter((providerId) => providerConfigured(providerId));

  if (candidates.length === 0) {
    throw new CliError("No transcription provider is configured with credentials.", {
      code: "TRANSCRIPTION_PROVIDER_NOT_CONFIGURED",
      exitCode: 2,
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
