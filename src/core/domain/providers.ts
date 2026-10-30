import type { EnvironmentVariables, PiTubeConfig } from "./config.ts";
import { createError } from "./errors.ts";
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
