import type { PiTubeConfig, ProviderConfig } from "../domain/config.ts";
import { createError } from "../domain/errors.ts";
import { findProvider, type ProviderDescriptor, type ProviderId, resolveCredential } from "../domain/providers.ts";
import { err, ok, type Result } from "../domain/result.ts";
import { ensureNotAborted, type OperationOptions, type UseCase } from "./operation.ts";
import type { AccountDeps } from "./providers.ts";

/** Input of `loginProvider`. The key comes from a hidden prompt or stdin, never from argv. */
export interface LoginInput {
  readonly provider: string;
  readonly apiKey: string;
}

/** Output of `loginProvider`. `overriddenByEnv` names an env var that wins over the stored key. */
export interface LoginOutput {
  readonly provider: ProviderId;
  readonly configLocation: string;
  readonly overriddenByEnv?: string;
}

/** Input of `logoutProvider`. */
export interface LogoutInput {
  readonly provider: string;
}

/** Output of `logoutProvider`. `stillSetInEnv` names an env var that keeps the provider configured. */
export interface LogoutOutput {
  readonly provider: ProviderId;
  readonly configLocation: string;
  readonly stillSetInEnv?: string;
}

const activeEnvName = (descriptor: ProviderDescriptor, config: PiTubeConfig, deps: AccountDeps): string | undefined => {
  const credential = resolveCredential(descriptor, config, deps.env);
  return credential.source === "env" ? credential.envName : undefined;
};

/** Replaces the stored credentials of one provider, checking cancellation before reading and before writing. */
const updateProvider = async (
  deps: AccountDeps,
  providerInput: string,
  entry: ProviderConfig,
  options: OperationOptions | undefined,
): Promise<Result<{ descriptor: ProviderDescriptor; config: PiTubeConfig }>> => {
  const ready = ensureNotAborted(options?.signal);
  if (!ready.success) return ready;
  const descriptor = findProvider(deps.providers, providerInput);
  if (!descriptor.success) return descriptor;
  const current = await deps.configStore.read();
  if (!current.success) return current;

  const config: PiTubeConfig = {
    ...current.data,
    providers: { ...current.data.providers, [descriptor.data.id]: entry },
  };
  const stillReady = ensureNotAborted(options?.signal);
  if (!stillReady.success) return stillReady;
  const written = await deps.configStore.write(config);
  if (!written.success) return written;
  return ok({ descriptor: descriptor.data, config });
};

/** Stores a provider API key in the config and clears its `api_key_env`. */
export const createLoginProvider =
  (deps: AccountDeps): UseCase<LoginInput, LoginOutput> =>
  async (input, options) => {
    const apiKey = input.apiKey.trim();
    if (apiKey.length === 0 || /\s/.test(apiKey)) {
      return err(createError("INPUT_INVALID", "API key must be a single token."));
    }
    const updated = await updateProvider(deps, input.provider, { api_key: apiKey }, options);
    if (!updated.success) return updated;

    const overriddenByEnv = activeEnvName(updated.data.descriptor, updated.data.config, deps);
    return ok({
      provider: updated.data.descriptor.id,
      configLocation: deps.configStore.location,
      ...(overriddenByEnv === undefined ? {} : { overriddenByEnv }),
    });
  };

/** Removes a provider's stored API key and `api_key_env`. */
export const createLogoutProvider =
  (deps: AccountDeps): UseCase<LogoutInput, LogoutOutput> =>
  async (input, options) => {
    const updated = await updateProvider(deps, input.provider, {}, options);
    if (!updated.success) return updated;

    const stillSetInEnv = activeEnvName(updated.data.descriptor, updated.data.config, deps);
    return ok({
      provider: updated.data.descriptor.id,
      configLocation: deps.configStore.location,
      ...(stillSetInEnv === undefined ? {} : { stillSetInEnv }),
    });
  };
