import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { TranscriptionProviderId } from "../transcription/types.ts";
import {
  CONFIG_KEYS,
  CONFIG_PROVIDER_IDS,
  CONFIG_VERSION,
  type ConfigKey,
  type ConfigProviderId,
  type PiTubeConfig,
} from "./types.ts";

export const CONFIG_PATH_ENV = "PI_TUBE_CONFIG_PATH";

export interface ConfigStoreOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
}

function baseConfig(): PiTubeConfig {
  return {
    version: CONFIG_VERSION,
    defaults: {},
    providers: {
      deepgram: {},
      groq: {},
      elevenlabs: {},
    },
  };
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeProvider(value: unknown): TranscriptionProviderId | undefined {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  if (normalized && isConfigProviderId(normalized)) {
    return normalized;
  }
  return undefined;
}

export function isConfigProviderId(value: string): value is ConfigProviderId {
  return CONFIG_PROVIDER_IDS.includes(value as ConfigProviderId);
}

function normalizeConfig(raw: unknown): PiTubeConfig {
  const config = baseConfig();
  if (!raw || typeof raw !== "object") {
    return config;
  }

  const input = raw as {
    version?: unknown;
    defaults?: { provider?: unknown; language?: unknown };
    providers?: {
      deepgram?: { api_key?: unknown; api_key_env?: unknown };
      groq?: { api_key?: unknown; api_key_env?: unknown };
      elevenlabs?: { api_key?: unknown; api_key_env?: unknown };
    };
  };

  config.version =
    typeof input.version === "number" && Number.isInteger(input.version)
      ? input.version
      : CONFIG_VERSION;
  config.defaults.provider = normalizeProvider(input.defaults?.provider);
  config.defaults.language = normalizeOptionalString(input.defaults?.language)?.toLowerCase();
  config.providers.deepgram.api_key = normalizeOptionalString(input.providers?.deepgram?.api_key);
  config.providers.deepgram.api_key_env = normalizeOptionalString(
    input.providers?.deepgram?.api_key_env,
  );
  config.providers.groq.api_key = normalizeOptionalString(input.providers?.groq?.api_key);
  config.providers.groq.api_key_env = normalizeOptionalString(input.providers?.groq?.api_key_env);
  config.providers.elevenlabs.api_key = normalizeOptionalString(input.providers?.elevenlabs?.api_key);
  config.providers.elevenlabs.api_key_env = normalizeOptionalString(input.providers?.elevenlabs?.api_key_env);

  return config;
}

function toStableString(config: PiTubeConfig): string {
  return `${JSON.stringify(normalizeConfig(config), null, 2)}\n`;
}

export function resolveConfigPath(options: ConfigStoreOptions = {}): string {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const explicit = normalizeOptionalString(env[CONFIG_PATH_ENV]);
  if (explicit) {
    return path.isAbsolute(explicit) ? explicit : path.resolve(cwd, explicit);
  }

  const home = normalizeOptionalString(env.HOME);
  if (home) {
    return path.join(home, ".pi-tube", "config.json");
  }

  return path.resolve(cwd, ".pi-tube", "config.json");
}

export function readConfig(options: ConfigStoreOptions = {}): PiTubeConfig {
  const configPath = resolveConfigPath(options);
  if (!existsSync(configPath)) {
    return baseConfig();
  }

  const raw = readFileSync(configPath, "utf8").trim();
  if (!raw) {
    return baseConfig();
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeConfig(parsed);
  } catch {
    return baseConfig();
  }
}

export function writeConfig(config: PiTubeConfig, options: ConfigStoreOptions = {}): string {
  const configPath = resolveConfigPath(options);
  const configDir = path.dirname(configPath);
  mkdirSync(configDir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(configDir, 0o700);
  } catch {
    // Best-effort hardening: config writes should still work on filesystems that reject chmod.
  }
  writeFileSync(configPath, toStableString(config), { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(configPath, 0o600);
  } catch {
    // Best-effort hardening: keep config usable even when chmod is unsupported.
  }
  return configPath;
}

function assertConfigKey(key: string): asserts key is ConfigKey {
  if (!CONFIG_KEYS.includes(key as ConfigKey)) {
    throw new Error(
      `Unsupported config key: \`${key}\`. Supported keys: ${CONFIG_KEYS.join(", ")}`,
    );
  }
}

function setProvider(value: string): TranscriptionProviderId {
  const normalized = value.trim().toLowerCase();
  if (isConfigProviderId(normalized)) {
    return normalized;
  }

  throw new Error("`defaults.provider` must be `deepgram`, `groq`, or `elevenlabs`.");
}

function validateEnvVarName(value: string, key: ConfigKey): string {
  const normalized = value.trim();
  const envVarPattern = /^[A-Z_][A-Z0-9_]*$/;
  if (!envVarPattern.test(normalized)) {
    throw new Error(`Config value for \`${key}\` must be an environment variable name (for example GROQ_API_KEY).`);
  }

  return normalized;
}

export function setConfigValue(
  key: string,
  value: string,
  options: ConfigStoreOptions = {},
): { configPath: string; config: PiTubeConfig } {
  assertConfigKey(key);
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    throw new Error(`Config value for \`${key}\` cannot be empty.`);
  }

  const config = readConfig(options);
  switch (key) {
    case "defaults.provider":
      config.defaults.provider = setProvider(trimmedValue);
      break;
    case "defaults.language":
      config.defaults.language = trimmedValue.toLowerCase();
      break;
    case "providers.deepgram.api_key":
      config.providers.deepgram.api_key = trimmedValue;
      break;
    case "providers.deepgram.api_key_env":
      config.providers.deepgram.api_key_env = validateEnvVarName(trimmedValue, key);
      break;
    case "providers.groq.api_key":
      config.providers.groq.api_key = trimmedValue;
      break;
    case "providers.groq.api_key_env":
      config.providers.groq.api_key_env = validateEnvVarName(trimmedValue, key);
      break;
    case "providers.elevenlabs.api_key":
      config.providers.elevenlabs.api_key = trimmedValue;
      break;
    case "providers.elevenlabs.api_key_env":
      config.providers.elevenlabs.api_key_env = validateEnvVarName(trimmedValue, key);
      break;
  }

  const configPath = writeConfig(config, options);
  return { configPath, config };
}

export function getConfigValue(key: string, options: ConfigStoreOptions = {}): unknown {
  assertConfigKey(key);
  const config = readConfig(options);
  switch (key) {
    case "defaults.provider":
      return config.defaults.provider;
    case "defaults.language":
      return config.defaults.language;
    case "providers.deepgram.api_key":
      return config.providers.deepgram.api_key;
    case "providers.deepgram.api_key_env":
      return config.providers.deepgram.api_key_env;
    case "providers.groq.api_key":
      return config.providers.groq.api_key;
    case "providers.groq.api_key_env":
      return config.providers.groq.api_key_env;
    case "providers.elevenlabs.api_key":
      return config.providers.elevenlabs.api_key;
    case "providers.elevenlabs.api_key_env":
      return config.providers.elevenlabs.api_key_env;
  }
}

export function listConfigValues(
  options: ConfigStoreOptions = {},
): Record<ConfigKey, unknown> {
  const config = readConfig(options);

  return {
    "defaults.provider": config.defaults.provider,
    "defaults.language": config.defaults.language,
    "providers.deepgram.api_key": config.providers.deepgram.api_key,
    "providers.deepgram.api_key_env": config.providers.deepgram.api_key_env,
    "providers.groq.api_key": config.providers.groq.api_key,
    "providers.groq.api_key_env": config.providers.groq.api_key_env,
    "providers.elevenlabs.api_key": config.providers.elevenlabs.api_key,
    "providers.elevenlabs.api_key_env": config.providers.elevenlabs.api_key_env,
  };
}
