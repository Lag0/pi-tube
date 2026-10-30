import type { EnvironmentVariables } from "../domain/config.ts";
import {
  type KeySource,
  type ProviderDescriptor,
  type ProviderId,
  type ProviderPositioning,
  resolveCredential,
} from "../domain/providers.ts";
import { ok } from "../domain/result.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import { ensureNotAborted, type UseCase } from "./operation.ts";

/** Dependencies of the account use cases. */
export interface AccountDeps {
  readonly configStore: ConfigStore;
  readonly env: EnvironmentVariables;
  readonly providers: readonly ProviderDescriptor[];
}

/** Whether a provider has a usable key, and where it comes from. Never carries the key. */
export interface ProviderStatus {
  readonly id: ProviderId;
  readonly positioning: ProviderPositioning;
  readonly configured: boolean;
  readonly keySource: KeySource;
  readonly envName?: string;
  readonly overridesConfigKey: boolean;
}

/** Output of `listProviders`. */
export interface ProviderListing {
  readonly configLocation: string;
  readonly providers: readonly ProviderStatus[];
}

/** Lists every provider, in registry order, with its credential status. */
export const createListProviders =
  (deps: AccountDeps): UseCase<Record<string, never>, ProviderListing> =>
  async (_input, options) => {
    const ready = ensureNotAborted(options?.signal);
    if (!ready.success) return ready;
    const config = await deps.configStore.read();
    if (!config.success) return config;

    return ok({
      configLocation: deps.configStore.location,
      providers: deps.providers.map((descriptor) => {
        const credential = resolveCredential(descriptor, config.data, deps.env);
        return {
          id: descriptor.id,
          positioning: descriptor.positioning,
          configured: credential.source !== "none",
          keySource: credential.source,
          ...(credential.envName === undefined ? {} : { envName: credential.envName }),
          overridesConfigKey: credential.overridesConfigKey,
        };
      }),
    });
  };
