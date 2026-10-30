import { createError } from "./errors.ts";
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
