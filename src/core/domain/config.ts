import { createError } from "./errors.ts";
import { findProvider, type ProviderDescriptor } from "./providers.ts";
import { err, ok, type Result } from "./result.ts";

/** Current config file format version. */
export const CONFIG_VERSION = 1;

/** Environment variables as the core sees them; adapters pass `process.env` or a fake. */
export type EnvironmentVariables = Readonly<Record<string, string | undefined>>;

/** Credentials stored for one provider. */
export interface ProviderConfig {
  readonly api_key?: string;
  readonly api_key_env?: string;
}

/** The user config file (`~/.pi-tube/config.json`), as the core sees it. */
export interface PiTubeConfig {
  readonly version: number;
  readonly defaults: {
    readonly provider?: string;
    readonly language?: string;
  };
  readonly providers: Readonly<Record<string, ProviderConfig>>;
}

/** Config used when the file does not exist yet. */
export const DEFAULT_CONFIG: PiTubeConfig = { version: CONFIG_VERSION, defaults: {}, providers: {} };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readStringFields = <F extends string>(
  container: Record<string, unknown>,
  fields: readonly F[],
  pathPrefix: string,
  fail: (fieldPath: string, expected: string) => Result<never>,
): Result<Partial<Record<F, string>>> => {
  const parsed: Partial<Record<F, string>> = {};
  for (const field of fields) {
    const value = container[field];
    if (value === undefined) continue;
    if (typeof value !== "string") return fail(`${pathPrefix}.${field}`, "a string");
    const trimmed = value.trim();
    if (trimmed.length > 0) parsed[field] = trimmed;
  }
  return ok(parsed);
};

/**
 * Validates the structure of a parsed config file. Only the shape is checked: a value that is
 * well-formed but semantically wrong (an unknown provider) fails where it is used, so `config set`
 * can still fix it. Strings are trimmed and empty strings are dropped.
 */
export const parseConfig = (raw: unknown, location: string): Result<PiTubeConfig> => {
  const fail = (fieldPath: string, expected: string): Result<never> =>
    err(createError("CONFIG_INVALID", `Config file ${location} is invalid: \`${fieldPath}\` must be ${expected}.`));

  if (!isRecord(raw)) return fail("(root)", "an object");
  const { version = CONFIG_VERSION, defaults = {}, providers = {} } = raw;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return fail("version", "an integer >= 1");
  }
  if (!isRecord(defaults)) return fail("defaults", "an object");
  if (!isRecord(providers)) return fail("providers", "an object");

  const parsedDefaults = readStringFields(defaults, ["provider", "language"], "defaults", fail);
  if (!parsedDefaults.success) return parsedDefaults;

  const parsedProviders: Array<[string, ProviderConfig]> = [];
  for (const [id, entry] of Object.entries(providers)) {
    if (!isRecord(entry)) return fail(`providers.${id}`, "an object");
    const parsedEntry = readStringFields(entry, ["api_key", "api_key_env"], `providers.${id}`, fail);
    if (!parsedEntry.success) return parsedEntry;
    parsedProviders.push([id, parsedEntry.data]);
  }

  return ok({ version, defaults: parsedDefaults.data, providers: Object.fromEntries(parsedProviders) });
};

const API_KEY_PATTERN = /^providers\.([^.]+)\.api_key$/;
const API_KEY_ENV_PATTERN = /^providers\.([^.]+)\.api_key_env$/;
const ENV_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

/** Keys that `config get|set|list` accept. API keys are not among them: only `auth login` stores one. */
export const configKeysFor = (descriptors: readonly ProviderDescriptor[]): readonly string[] => [
  "defaults.provider",
  "defaults.language",
  ...descriptors.map((descriptor) => `providers.${descriptor.id}.api_key_env`),
];

/** Checks that `key` is one of `configKeysFor(descriptors)`; an API key path gets a hint to `auth login`. */
export const checkConfigKey = (key: string, descriptors: readonly ProviderDescriptor[]): Result<string> => {
  const trimmed = key.trim();
  const apiKeyProvider = API_KEY_PATTERN.exec(trimmed)?.[1];
  if (apiKeyProvider !== undefined) {
    return err(
      createError("INPUT_INVALID", "API keys cannot be read or set with `config`.", {
        hint: `Use \`pi-tube auth login ${apiKeyProvider}\`; API keys are never passed as arguments.`,
      }),
    );
  }
  const keys = configKeysFor(descriptors);
  if (keys.includes(trimmed)) return ok(trimmed);
  return err(
    createError("INPUT_INVALID", `Unknown config key \`${trimmed}\`.`, { hint: `Use one of: ${keys.join(", ")}.` }),
  );
};

/** Value of a key from `configKeysFor`; `undefined` when unset. */
export const getConfigValue = (config: PiTubeConfig, key: string): string | undefined => {
  if (key === "defaults.provider") return config.defaults.provider;
  if (key === "defaults.language") return config.defaults.language;
  const providerId = API_KEY_ENV_PATTERN.exec(key)?.[1];
  return providerId === undefined ? undefined : config.providers[providerId]?.api_key_env;
};

/** Returns `config` with `key` set to the normalized `value`; values are never echoed in errors. */
export const applyConfigValue = (
  config: PiTubeConfig,
  key: string,
  value: string,
  descriptors: readonly ProviderDescriptor[],
): Result<PiTubeConfig> => {
  const checkedKey = checkConfigKey(key, descriptors);
  if (!checkedKey.success) return checkedKey;
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return err(createError("INPUT_INVALID", `A value for \`${checkedKey.data}\` is required.`));
  }

  if (checkedKey.data === "defaults.provider") {
    const provider = findProvider(descriptors, trimmedValue);
    if (!provider.success) return provider;
    return ok({ ...config, defaults: { ...config.defaults, provider: provider.data.id } });
  }
  if (checkedKey.data === "defaults.language") {
    return ok({ ...config, defaults: { ...config.defaults, language: trimmedValue.toLowerCase() } });
  }

  const providerId = API_KEY_ENV_PATTERN.exec(checkedKey.data)?.[1];
  if (providerId === undefined) throw new Error(`configKeysFor returned an unhandled key: ${checkedKey.data}`);
  if (!ENV_NAME_PATTERN.test(trimmedValue)) {
    return err(
      createError("INPUT_INVALID", `\`${checkedKey.data}\` must be an environment variable name.`, {
        hint: "Use uppercase letters, digits and underscores, such as `MY_GROQ_KEY`.",
      }),
    );
  }
  return ok({
    ...config,
    providers: { ...config.providers, [providerId]: { ...config.providers[providerId], api_key_env: trimmedValue } },
  });
};
