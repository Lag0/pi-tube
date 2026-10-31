import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_CONFIG, type PiTubeConfig, parseConfig } from "../../core/domain/config.ts";
import { createError } from "../../core/domain/errors.ts";
import { err, ok, type Result } from "../../core/domain/result.ts";
import type { ConfigStore } from "../../core/ports/config-store.ts";
import { errnoOf } from "../errno.ts";

type RawConfig = Readonly<Record<string, unknown>>;

interface LoadedConfig {
  readonly raw: RawConfig;
  readonly config: PiTubeConfig;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const ioFailed = (action: "read" | "write", location: string, error: unknown): Result<never> =>
  err(createError("CONFIG_IO_FAILED", `Cannot ${action} config file ${location} (${errnoOf(error)}).`));

/** Loads the raw object too, so a write can keep the keys this version does not know. */
const loadConfig = async (configFile: string): Promise<Result<LoadedConfig>> => {
  let text: string;
  try {
    // Editors on Windows may save a UTF-8 BOM; v2 tolerated it, so v3 does too.
    text = (await readFile(configFile, "utf8")).replace(/^\uFEFF/, "");
  } catch (error) {
    if (errnoOf(error) === "ENOENT") return ok({ raw: {}, config: DEFAULT_CONFIG });
    return ioFailed("read", configFile, error);
  }
  if (text.trim().length === 0) return ok({ raw: {}, config: DEFAULT_CONFIG });

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return err(createError("CONFIG_INVALID", `Config file ${configFile} is not valid JSON.`));
  }
  const parsed = parseConfig(raw, configFile);
  if (!parsed.success) return parsed;
  return ok({ raw: isRecord(raw) ? raw : {}, config: parsed.data });
};

/** Overlays `fields` on `base`, keeping unknown keys and their order; an `undefined` field is removed. */
const withFields = (base: unknown, fields: Readonly<Record<string, string | undefined>>): RawConfig => {
  const source = isRecord(base) ? base : {};
  const pairs: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(source)) {
    if (!Object.hasOwn(fields, key)) pairs.push([key, value]);
    else if (fields[key] !== undefined) pairs.push([key, fields[key]]);
  }
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && !Object.hasOwn(source, key)) pairs.push([key, value]);
  }
  return Object.fromEntries(pairs);
};

const mergeConfig = (raw: RawConfig, config: PiTubeConfig): RawConfig => {
  const rawProviders = isRecord(raw.providers) ? raw.providers : {};
  const ids = new Set([...Object.keys(rawProviders), ...Object.keys(config.providers)]);
  const providers = Object.fromEntries(
    [...ids].map((id) => [
      id,
      withFields(rawProviders[id], {
        api_key: config.providers[id]?.api_key,
        api_key_env: config.providers[id]?.api_key_env,
      }),
    ]),
  );
  return {
    ...raw,
    version: config.version,
    defaults: withFields(raw.defaults, { provider: config.defaults.provider, language: config.defaults.language }),
    providers,
  };
};

const writeAtomically = async (configFile: string, content: string): Promise<Result<void>> => {
  const directory = path.dirname(configFile);
  const tempFile = `${configFile}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const created = await mkdir(directory, { recursive: true, mode: 0o700 });
    if (created !== undefined) {
      // Best-effort hardening: only a directory we created is tightened, and some filesystems reject chmod.
      await chmod(directory, 0o700).catch(() => undefined);
    }
    await writeFile(tempFile, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(tempFile, configFile);
    return ok(undefined);
  } catch (error) {
    // The write error is what gets reported; a leftover temp file never affects reads.
    await rm(tempFile, { force: true }).catch(() => undefined);
    return ioFailed("write", configFile, error);
  }
};

/** Config store on a JSON file. Writes are atomic (temp file + rename, mode 600) and never replace an unreadable file. */
export const createFileConfigStore = (configFile: string): ConfigStore => ({
  location: configFile,
  read: async () => {
    const loaded = await loadConfig(configFile);
    return loaded.success ? ok(loaded.data.config) : loaded;
  },
  write: async (config) => {
    const loaded = await loadConfig(configFile);
    if (!loaded.success) return loaded;
    return writeAtomically(configFile, `${JSON.stringify(mergeConfig(loaded.data.raw, config), null, 2)}\n`);
  },
});
