import {
  CliError,
  createTranscriptionProviderNotConfiguredError,
} from "../errors/cli-errors.ts";
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
  env?: Record<string, string | undefined>;
} = {}): TranscriptionProviderId {
  const fromCli = options.provider?.trim().toLowerCase();
  if (fromCli) {
    return parseProviderId(fromCli);
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

export async function transcribeFromResolvedSource(
  source: ResolvedSource,
  options: TranscriptionServiceOptions = {},
): Promise<TranscriptionExecutionResult> {
  const env = options.env ?? process.env;
  const providerId = selectTranscriptionProvider({ provider: options.provider, env });
  const requestedLanguage = normalizeLanguage(options.language ?? env[TRANSCRIPTION_LANGUAGE_ENV]);
  const registry = options.providers ?? getDefaultProviderRegistry();
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
