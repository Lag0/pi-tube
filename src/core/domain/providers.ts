import type { EnvironmentVariables, PiTubeConfig } from "./config.ts";
import { createError, type PiTubeError } from "./errors.ts";
import { err, ok, type Result } from "./result.ts";

/** Speech-to-text provider id, such as `groq`. */
export type ProviderId = string;

/** How a provider is positioned to the user. */
export type ProviderPositioning = "highest_accuracy" | "best_value";

/** Where a provider credential comes from. */
export type KeySource = "env" | "config" | "none";

/** Static facts about a provider: its id, positioning and the env vars that may hold its key. */
export interface ProviderDescriptor {
  readonly id: ProviderId;
  readonly positioning: ProviderPositioning;
  readonly credentialEnvNames: readonly string[];
}

/** The credential that applies to a provider right now. */
export interface ResolvedCredential {
  readonly source: KeySource;
  readonly apiKey?: string;
  readonly envName?: string;
  /** True when an env var wins over a key that is also stored in the config. */
  readonly overridesConfigKey: boolean;
}

/**
 * Resolves a provider credential with env over config: first the config's `api_key_env`, then the
 * provider's default env names, then the config's `api_key`. Blank values are ignored.
 */
export const resolveCredential = (
  descriptor: ProviderDescriptor,
  config: PiTubeConfig,
  env: EnvironmentVariables,
): ResolvedCredential => {
  const stored = config.providers[descriptor.id];
  const envNames = [stored?.api_key_env, ...descriptor.credentialEnvNames].filter(
    (name): name is string => name !== undefined,
  );
  for (const envName of envNames) {
    const apiKey = env[envName]?.trim();
    if (apiKey) return { source: "env", apiKey, envName, overridesConfigKey: stored?.api_key !== undefined };
  }
  if (stored?.api_key) return { source: "config", apiKey: stored.api_key, overridesConfigKey: false };
  return { source: "none", overridesConfigKey: false };
};

/** Finds a provider by id, ignoring case and surrounding spaces. */
export const findProvider = (descriptors: readonly ProviderDescriptor[], id: string): Result<ProviderDescriptor> => {
  const normalized = id.trim().toLowerCase();
  const descriptor = descriptors.find((candidate) => candidate.id === normalized);
  if (descriptor) return ok(descriptor);
  return err(
    createError("PROVIDER_INVALID", `Unknown provider \`${id.trim()}\`.`, {
      hint: `Use one of: ${descriptors.map((candidate) => candidate.id).join(", ")}.`,
    }),
  );
};

/** Where a provider choice came from; named in errors so the user knows what to fix. */
type ProviderChoiceSource = "explicit" | "env" | "config";

const PROVIDER_CHOICE_LABEL: Readonly<Record<ProviderChoiceSource, string>> = {
  explicit: "",
  env: " in `PI_TUBE_TRANSCRIPTION_PROVIDER`",
  config: " in config `defaults.provider`",
};

const notConfigured = (descriptor: ProviderDescriptor): PiTubeError =>
  createError("PROVIDER_NOT_CONFIGURED", `Provider \`${descriptor.id}\` is not configured.`, {
    hint: `Run \`pi-tube auth login ${descriptor.id}\` or set ${descriptor.credentialEnvNames[0] ?? "its API key env var"}.`,
  });

/**
 * Picks the provider for a transcription, with no fallback: the explicit choice, then
 * `PI_TUBE_TRANSCRIPTION_PROVIDER`, then the config default, then the first configured provider in
 * registry order. A chosen provider without a key fails instead of trying another one.
 */
export const selectProvider = (input: {
  readonly explicit?: string;
  readonly envDefault?: string;
  readonly configDefault?: string;
  readonly descriptors: readonly ProviderDescriptor[];
  readonly config: PiTubeConfig;
  readonly env: EnvironmentVariables;
}): Result<{ readonly descriptor: ProviderDescriptor; readonly apiKey: string }> => {
  const choices: ReadonlyArray<readonly [string | undefined, ProviderChoiceSource]> = [
    [input.explicit, "explicit"],
    [input.envDefault, "env"],
    [input.configDefault, "config"],
  ];
  for (const [value, source] of choices) {
    const choice = value?.trim();
    if (!choice) continue;
    const found = findProvider(input.descriptors, choice);
    if (!found.success) {
      return err(
        createError("PROVIDER_INVALID", `Unknown provider \`${choice}\`${PROVIDER_CHOICE_LABEL[source]}.`, {
          hint: found.error.hint,
        }),
      );
    }
    const { apiKey } = resolveCredential(found.data, input.config, input.env);
    return apiKey ? ok({ descriptor: found.data, apiKey }) : err(notConfigured(found.data));
  }
  for (const descriptor of input.descriptors) {
    const { apiKey } = resolveCredential(descriptor, input.config, input.env);
    if (apiKey) return ok({ descriptor, apiKey });
  }
  return err(
    createError("PROVIDER_NOT_CONFIGURED", "No transcription provider is configured.", {
      hint: `Run \`pi-tube auth login <provider>\` or set ${input.descriptors.map((descriptor) => descriptor.credentialEnvNames[0]).join(", ")}.`,
    }),
  );
};
