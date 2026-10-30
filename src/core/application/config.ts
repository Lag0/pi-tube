import { applyConfigValue, checkConfigKey, configKeysFor, getConfigValue } from "../domain/config.ts";
import type { ProviderDescriptor } from "../domain/providers.ts";
import { ok } from "../domain/result.ts";
import type { ConfigStore } from "../ports/config-store.ts";
import { ensureNotAborted, type UseCase } from "./operation.ts";

/** Dependencies of the config use cases. */
export interface ConfigDeps {
  readonly configStore: ConfigStore;
  readonly providers: readonly ProviderDescriptor[];
}

/** Output of `getConfigValue`. */
export interface ConfigValue {
  readonly key: string;
  readonly value?: string;
  readonly configLocation: string;
}

/** Output of `setConfigValue`; `value` is the normalized value that was stored. */
export interface ConfigValueSet {
  readonly key: string;
  readonly value: string;
  readonly configLocation: string;
}

/** Output of `listConfigValues`: every key from `configKeysFor`, unset ones as `undefined`. */
export interface ConfigValues {
  readonly configLocation: string;
  readonly values: Readonly<Record<string, string | undefined>>;
}

/** Reads one config value. */
export const createGetConfigValue =
  (deps: ConfigDeps): UseCase<{ readonly key: string }, ConfigValue> =>
  async (input, options) => {
    const ready = ensureNotAborted(options?.signal);
    if (!ready.success) return ready;
    const key = checkConfigKey(input.key, deps.providers);
    if (!key.success) return key;
    const config = await deps.configStore.read();
    if (!config.success) return config;

    const value = getConfigValue(config.data, key.data);
    return ok({ key: key.data, ...(value === undefined ? {} : { value }), configLocation: deps.configStore.location });
  };

/** Validates, normalizes and stores one config value. */
export const createSetConfigValue =
  (deps: ConfigDeps): UseCase<{ readonly key: string; readonly value: string }, ConfigValueSet> =>
  async (input, options) => {
    const ready = ensureNotAborted(options?.signal);
    if (!ready.success) return ready;
    const config = await deps.configStore.read();
    if (!config.success) return config;
    const updated = applyConfigValue(config.data, input.key, input.value, deps.providers);
    if (!updated.success) return updated;
    const stillReady = ensureNotAborted(options?.signal);
    if (!stillReady.success) return stillReady;
    const written = await deps.configStore.write(updated.data);
    if (!written.success) return written;

    const key = input.key.trim();
    return ok({
      key,
      value: getConfigValue(updated.data, key) ?? input.value.trim(),
      configLocation: deps.configStore.location,
    });
  };

/** Lists every config key with its value. */
export const createListConfigValues =
  (deps: ConfigDeps): UseCase<Record<string, never>, ConfigValues> =>
  async (_input, options) => {
    const ready = ensureNotAborted(options?.signal);
    if (!ready.success) return ready;
    const config = await deps.configStore.read();
    if (!config.success) return config;

    const values = Object.fromEntries(
      configKeysFor(deps.providers).map((key) => [key, getConfigValue(config.data, key)]),
    );
    return ok({ configLocation: deps.configStore.location, values });
  };
