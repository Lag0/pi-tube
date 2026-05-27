import { CliError } from "../errors/cli-errors.ts";
import { downloadMedia } from "../download/service.ts";
import type { DownloadResult } from "../download/types.ts";
import { resolveSource } from "../intake/resolver.ts";
import { buildOutputArtifact } from "../output/build-artifact.ts";
import { renderJson } from "../output/json.ts";
import { renderMarkdown } from "../output/markdown.ts";
import { persistOutputArtifact, type PersistedOutputArtifact } from "./persist-output.ts";
import {
  getConfigValue,
  isConfigProviderId,
  readConfig,
  listConfigValues,
  resolveConfigPath,
  setConfigValue,
  writeConfig,
  type ConfigStoreOptions,
} from "../config/store.ts";
import { CONFIG_KEYS, CONFIG_PROVIDER_IDS, type ConfigKey, type ConfigProviderId } from "../config/types.ts";
import {
  transcribeFromResolvedSource,
  type TranscriptionServiceOptions,
} from "../transcription/service.ts";
import type { TranscriptionExecutionResult } from "../transcription/types.ts";

export interface ProgressStep {
  label: string;
  detail?: string;
}

export interface BaselineInput {
  input: string;
  json: boolean;
  timestamps: boolean;
  extraPositionals: string[];
  provider?: string;
  language?: string;
  transcriptionOptions?: Omit<TranscriptionServiceOptions, "provider" | "language">;
  onProgress?: (step: ProgressStep) => void;
}

export interface BaselineIntakeResult {
  transcription: TranscriptionExecutionResult;
  json: boolean;
  timestamps: boolean;
}

interface PersistBaselineIntakeOptions {
  env?: Record<string, string | undefined>;
  cwd?: string;
  now?: Date;
}

interface ConfigCommandInput {
  args: string[];
  json: boolean;
  options?: ConfigStoreOptions;
}

export interface AuthLoginInput {
  provider?: string;
  apiKey?: string;
  options?: ConfigStoreOptions;
}

export interface AuthLogoutInput {
  provider?: string;
  options?: ConfigStoreOptions;
}

export interface AuthStatusInput {
  env?: Record<string, string | undefined>;
  options?: ConfigStoreOptions;
}

export interface DefaultsProviderInput {
  provider?: string;
  options?: ConfigStoreOptions;
}

export interface DefaultsLanguageInput {
  language?: string;
  options?: ConfigStoreOptions;
}

export interface DefaultsShowInput {
  options?: ConfigStoreOptions;
}

export interface DownloadCommandInput {
  input?: string;
  extraPositionals: string[];
  audio: boolean;
  outputDir?: string;
  env?: Record<string, string | undefined>;
  cwd?: string;
  onProgress?: (step: ProgressStep) => void;
}

export async function handleBaselineInput({
  input,
  json,
  timestamps,
  extraPositionals,
  provider,
  language,
  transcriptionOptions,
  onProgress,
}: BaselineInput): Promise<BaselineIntakeResult> {
  if (extraPositionals.length > 0) {
    throw new CliError("Only one positional input is supported in Phase 2.", {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: [
        "Use one of: `pi-tube transcribe <input>`, `pi-tube transcribe <input> --provider <deepgram|groq|elevenlabs>`, `pi-tube transcribe <input> --json`.",
      ],
    });
  }

  onProgress?.({ label: "Resolving source..." });
  const source = await resolveSource(input);

  const sourceDetail = source.kind === "youtube" || source.kind === "instagram"
    ? source.title ?? source.kind
    : source.kind === "local_file"
      ? source.kind
      : "direct url";

  onProgress?.({ label: "Transcribing audio...", detail: `(${sourceDetail})` });
  const transcription = await transcribeFromResolvedSource(source, {
    ...transcriptionOptions,
    provider,
    language,
  });

  return {
    transcription,
    json,
    timestamps,
  };
}

export function formatBaselineIntakeResult(result: BaselineIntakeResult): string {
  const artifact = buildOutputArtifact(result.transcription, {
    includeTimestamps: result.timestamps,
  });
  return result.json ? renderJson(artifact) : renderMarkdown(artifact);
}

function maskSecretForStatus(value: string | undefined): string {
  if (!value) return "-";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

function defaultProviderEnvNames(provider: ConfigProviderId): string[] {
  if (provider === "deepgram") return ["DEEPGRAM_API_KEY"];
  if (provider === "groq") return ["GROQ_API_KEY"];
  return ["ELEVENLABS_API_KEY", "ELEVEN_API_KEY"];
}

function requireAuthProvider(provider: string | undefined): ConfigProviderId {
  if (!provider) {
    throw new CliError("Missing provider.", {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: ["Use one of: `pi-tube auth login <deepgram|groq|elevenlabs>`, `pi-tube auth status`, `pi-tube auth logout <deepgram|groq|elevenlabs>`."],
    });
  }
  return requireConfigProviderId(provider);
}

export function handleAuthLogin({ provider, apiKey, options }: AuthLoginInput): string {
  const providerId = requireAuthProvider(provider);
  const normalizedApiKey = apiKey?.trim();
  if (!normalizedApiKey) {
    throw new CliError("Missing API key.", {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: ["Use one of: `pi-tube auth login <deepgram|groq|elevenlabs>`, `pi-tube auth login <deepgram|groq|elevenlabs> --key <api_key>`."],
    });
  }

  const key = `providers.${providerId}.api_key` as ConfigKey;
  const { configPath } = withConfigValidation(() => setConfigValue(key, normalizedApiKey, options));
  const config = readConfig(options);
  config.providers[providerId].api_key_env = undefined;
  writeConfig(config, options);

  return `[AUTH_LOGIN] provider=${providerId} status=configured key=${maskSecretForStatus(normalizedApiKey)} config_path=${configPath}`;
}

export function handleAuthLogout({ provider, options }: AuthLogoutInput): string {
  const providerId = requireAuthProvider(provider);
  const config = readConfig(options);
  config.providers[providerId].api_key = undefined;
  config.providers[providerId].api_key_env = undefined;
  const configPath = writeConfig(config, options);
  return `[AUTH_LOGOUT] provider=${providerId} status=removed config_path=${configPath}`;
}

export function handleAuthStatus({ env = process.env, options }: AuthStatusInput): string {
  const config = readConfig(options);
  const configPath = resolveConfigPath(options);
  const lines = ["[AUTH_STATUS]", `config_path=${configPath}`];
  for (const providerId of CONFIG_PROVIDER_IDS) {
    const configKey = config.providers[providerId].api_key;
    const envEntry = defaultProviderEnvNames(providerId)
      .map((envName) => ({ envName, value: env[envName]?.trim() }))
      .find((entry) => entry.value);
    const configured = Boolean(configKey || envEntry?.value);
    const source = configKey ? "config" : envEntry?.value ? envEntry.envName : "-";
    const masked = maskSecretForStatus(configKey ?? envEntry?.value);
    lines.push(`${providerId} configured=${configured} source=${source} key=${masked}`);
  }
  return lines.join("\n");
}

export function handleDefaultsProvider({ provider, options }: DefaultsProviderInput): string {
  if (!provider) {
    throw new CliError("Missing default provider.", {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: ["Use one of: `pi-tube defaults provider <deepgram|groq|elevenlabs>`, `pi-tube defaults language <code>`, `pi-tube defaults show`."],
    });
  }
  const providerId = requireConfigProviderId(provider);
  const { configPath } = withConfigValidation(() => setConfigValue("defaults.provider", providerId, options));
  return `[DEFAULTS_SET] provider=${providerId} config_path=${configPath}`;
}

export function handleDefaultsLanguage({ language, options }: DefaultsLanguageInput): string {
  const normalizedLanguage = language?.trim();
  if (!normalizedLanguage) {
    throw new CliError("Missing default language.", {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: ["Use one of: `pi-tube defaults provider <deepgram|groq|elevenlabs>`, `pi-tube defaults language <code>`, `pi-tube defaults show`."],
    });
  }
  const { configPath, config } = withConfigValidation(() => setConfigValue("defaults.language", normalizedLanguage, options));
  return `[DEFAULTS_SET] language=${config.defaults.language} config_path=${configPath}`;
}

export function handleDefaultsShow({ options }: DefaultsShowInput = {}): string {
  const config = readConfig(options);
  const configPath = resolveConfigPath(options);
  return [
    "[DEFAULTS_SHOW]",
    `config_path=${configPath}`,
    `provider=${config.defaults.provider ?? "(unset)"}`,
    `language=${config.defaults.language ?? "(unset)"}`,
  ].join("\n");
}

export async function handleDownloadCommand({
  input,
  extraPositionals,
  audio,
  outputDir,
  env,
  cwd,
  onProgress,
}: DownloadCommandInput): Promise<DownloadResult> {
  if (!input) {
    throw new CliError("`download` expects a YouTube or Instagram URL.", {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: ["Use one of: `pi-tube download <url>`, `pi-tube download <url> --audio`, `pi-tube download <url> --output <dir>`."],
    });
  }

  if (extraPositionals.length > 0) {
    throw new CliError("`download` accepts exactly one URL input.", {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: ["Use one of: `pi-tube download <url>`, `pi-tube download <url> --audio`, `pi-tube download <url> --output <dir>`."],
    });
  }

  onProgress?.({ label: "Downloading media...", detail: audio ? "(audio)" : "(video)" });
  return downloadMedia(input, {
    media: audio ? "audio" : "video",
    outputDir,
    env,
    cwd,
  });
}

export function persistBaselineIntakeResult(
  result: BaselineIntakeResult,
  options: PersistBaselineIntakeOptions = {},
): PersistedOutputArtifact {
  const artifact = buildOutputArtifact(result.transcription, {
    includeTimestamps: result.timestamps,
  });
  const content = result.json ? renderJson(artifact) : renderMarkdown(artifact);

  return persistOutputArtifact({
    artifact,
    content,
    asJson: result.json,
    env: options.env,
    cwd: options.cwd,
    now: options.now,
  });
}

function requireConfigKey(key: string): ConfigKey {
  const supportedKeys = new Set(CONFIG_KEYS);

  if (!supportedKeys.has(key as ConfigKey)) {
    throw new CliError(`Unsupported config key: \`${key}\`.`, {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: [`Use one of: ${Array.from(supportedKeys).join(", ")}.`],
    });
  }

  return key as ConfigKey;
}

function asPrintableValue(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return "(unset)";
  }

  return String(value);
}

function isSensitiveConfigKey(key: string): boolean {
  return key.endsWith(".api_key");
}

function maskSecretValue(value: unknown): string {
  const printable = asPrintableValue(value);
  if (printable === "(unset)") {
    return printable;
  }

  const compact = String(value ?? "");
  if (compact.length <= 6) {
    return "***";
  }

  return `${compact.slice(0, 3)}***${compact.slice(-2)}`;
}

function toDisplayConfigValue(key: string, value: unknown): string {
  if (isSensitiveConfigKey(key)) {
    return maskSecretValue(value);
  }

  return asPrintableValue(value);
}

function formatConfigListText(configPath: string, values: Record<string, unknown>): string {
  const lines = ["[CONFIG_LIST]", `config_path=${configPath}`];
  for (const [key, value] of Object.entries(values)) {
    lines.push(`${key}=${toDisplayConfigValue(key, value)}`);
  }
  return lines.join("\n");
}

function withConfigValidation<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }

    const detail = error instanceof Error ? error.message : "Invalid config operation.";
    throw new CliError(detail, {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: [
        "Run `pi-tube config --help` for supported keys and aliases.",
      ],
    });
  }
}

function requireConfigProviderId(input: string): ConfigProviderId {
  const normalized = input.trim().toLowerCase();
  if (isConfigProviderId(normalized)) {
    return normalized;
  }

  throw new CliError(`Unsupported provider: \`${input}\`.`, {
    code: "CLI_CONTRACT_VIOLATION",
    exitCode: 2,
    guidance: ["Use one of: deepgram, groq, elevenlabs."],
  });
}

function requireEnvVarName(value: string): string {
  const normalized = value.trim();
  const envVarPattern = /^[A-Z_][A-Z0-9_]*$/;
  if (envVarPattern.test(normalized)) {
    return normalized;
  }

  throw new CliError(
    "`config provider env` expects an environment variable name (for example `GROQ_API_KEY`), not a raw key value.",
    {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: [
        "Use `pi-tube config provider env <provider> <ENV_VAR>` with an env var name.",
        "If you intentionally want plaintext storage, use `pi-tube config provider key <provider> <api_key>`.",
      ],
    },
  );
}

function formatConfigGetResult({
  json,
  configPath,
  action,
  key,
  value,
}: {
  json: boolean;
  configPath: string;
  action: string;
  key: ConfigKey;
  value: unknown;
}): string {
  if (json) {
    return JSON.stringify(
      {
        command: "config",
        action,
        key,
        value: value === undefined || value === null ? null : toDisplayConfigValue(key, value),
        config_path: configPath,
      },
      null,
      2,
    );
  }

  return `[CONFIG_GET] key=${key} value=${toDisplayConfigValue(key, value)} config_path=${configPath}`;
}

function formatConfigSetResult({
  json,
  configPath,
  action,
  key,
  value,
}: {
  json: boolean;
  configPath: string;
  action: string;
  key: ConfigKey;
  value: unknown;
}): string {
  if (json) {
    return JSON.stringify(
      {
        command: "config",
        action,
        key,
        value: value === undefined || value === null ? null : toDisplayConfigValue(key, value),
        config_path: configPath,
      },
      null,
      2,
    );
  }

  return `[CONFIG_SET] key=${key} value=${toDisplayConfigValue(key, value)} config_path=${configPath}`;
}

export function handleConfigCommand({
  args,
  json,
  options,
}: ConfigCommandInput): string {
  const [action, ...rest] = args;
  const configPath = resolveConfigPath(options);

  if (!action) {
    throw new CliError("Missing `config` action. Use `set`, `get`, `list`, `provider`, or `language`.", {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: [
        "Use `pi-tube config list`.",
        "Use `pi-tube config get <key>`.",
        "Use `pi-tube config set <key> <value>`.",
        "Use `pi-tube config provider set <deepgram|groq|elevenlabs>`.",
        "Use `pi-tube config language set <code>`.",
      ],
    });
  }

  if (action === "list") {
    if (rest.length !== 0) {
      throw new CliError("`config list` does not accept extra arguments.", {
        code: "CLI_CONTRACT_VIOLATION",
        exitCode: 2,
      });
    }
    const values = withConfigValidation(() => listConfigValues(options));
    if (json) {
      return JSON.stringify(
        {
          command: "config",
          action: "list",
          config_path: configPath,
          values,
        },
        null,
        2,
      );
    }
    return formatConfigListText(configPath, values);
  }

  if (action === "get") {
    const [rawKey, ...extra] = rest;
    if (!rawKey || extra.length > 0) {
      throw new CliError("`config get` expects exactly one key.", {
        code: "CLI_CONTRACT_VIOLATION",
        exitCode: 2,
      });
    }

    const key = requireConfigKey(rawKey);
    const value = withConfigValidation(() => getConfigValue(key, options));
    return formatConfigGetResult({ json, configPath, action: "get", key, value });
  }

  if (action === "set") {
    const [rawKey, rawValue, ...extra] = rest;
    if (!rawKey || !rawValue || extra.length > 0) {
      throw new CliError("`config set` expects exactly `<key> <value>`.", {
        code: "CLI_CONTRACT_VIOLATION",
        exitCode: 2,
      });
    }

    const key = requireConfigKey(rawKey);
    withConfigValidation(() => setConfigValue(key, rawValue, options));
    const value = withConfigValidation(() =>
      getConfigValue(key, { ...options, env: options?.env ?? process.env }));
    return formatConfigSetResult({ json, configPath, action: "set", key, value });
  }

  if (action === "provider") {
    const [providerAction, ...providerArgs] = rest;
    if (!providerAction) {
      throw new CliError("`config provider` requires one of: set, get, env, key.", {
        code: "CLI_CONTRACT_VIOLATION",
        exitCode: 2,
      });
    }

    if (providerAction === "set") {
      const [provider, ...extra] = providerArgs;
      if (!provider || extra.length > 0) {
        throw new CliError("`config provider set` expects exactly one provider.", {
          code: "CLI_CONTRACT_VIOLATION",
          exitCode: 2,
          guidance: ["Use `pi-tube config provider set <deepgram|groq|elevenlabs>`."],
        });
      }

      const key: ConfigKey = "defaults.provider";
      const providerId = requireConfigProviderId(provider);
      withConfigValidation(() => setConfigValue(key, providerId, options));
      const value = withConfigValidation(() =>
        getConfigValue(key, { ...options, env: options?.env ?? process.env }));
      return formatConfigSetResult({ json, configPath, action: "provider.set", key, value });
    }

    if (providerAction === "get") {
      if (providerArgs.length > 0) {
        throw new CliError("`config provider get` does not accept extra arguments.", {
          code: "CLI_CONTRACT_VIOLATION",
          exitCode: 2,
        });
      }

      const key: ConfigKey = "defaults.provider";
      const value = withConfigValidation(() => getConfigValue(key, options));
      return formatConfigGetResult({ json, configPath, action: "provider.get", key, value });
    }

    if (providerAction === "env" || providerAction === "key") {
      const [provider, valueInput, ...extra] = providerArgs;
      if (!provider || !valueInput || extra.length > 0) {
        const actionHint = providerAction === "env" ? "<provider> <ENV_VAR>" : "<provider> <api_key>";
        throw new CliError(`\`config provider ${providerAction}\` expects exactly ${actionHint}.`, {
          code: "CLI_CONTRACT_VIOLATION",
          exitCode: 2,
        });
      }

      const providerId = requireConfigProviderId(provider);
      const normalizedValue = providerAction === "env" ? requireEnvVarName(valueInput) : valueInput;
      const key = providerAction === "env"
        ? (`providers.${providerId}.api_key_env` as ConfigKey)
        : (`providers.${providerId}.api_key` as ConfigKey);
      withConfigValidation(() => setConfigValue(key, normalizedValue, options));
      const value = withConfigValidation(() =>
        getConfigValue(key, { ...options, env: options?.env ?? process.env }));
      return formatConfigSetResult({ json, configPath, action: `provider.${providerAction}`, key, value });
    }

    throw new CliError(`Unsupported \`config provider\` action: \`${providerAction}\`.`, {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: ["Use one of: set, get, env, key."],
    });
  }

  if (action === "language") {
    const [languageAction, ...languageArgs] = rest;
    if (!languageAction) {
      throw new CliError("`config language` requires one of: set, get.", {
        code: "CLI_CONTRACT_VIOLATION",
        exitCode: 2,
      });
    }

    const key: ConfigKey = "defaults.language";

    if (languageAction === "set") {
      const [valueInput, ...extra] = languageArgs;
      if (!valueInput || extra.length > 0) {
        throw new CliError("`config language set` expects exactly one language code.", {
          code: "CLI_CONTRACT_VIOLATION",
          exitCode: 2,
        });
      }

      withConfigValidation(() => setConfigValue(key, valueInput, options));
      const value = withConfigValidation(() =>
        getConfigValue(key, { ...options, env: options?.env ?? process.env }));
      return formatConfigSetResult({ json, configPath, action: "language.set", key, value });
    }

    if (languageAction === "get") {
      if (languageArgs.length > 0) {
        throw new CliError("`config language get` does not accept extra arguments.", {
          code: "CLI_CONTRACT_VIOLATION",
          exitCode: 2,
        });
      }

      const value = withConfigValidation(() => getConfigValue(key, options));
      return formatConfigGetResult({ json, configPath, action: "language.get", key, value });
    }

    throw new CliError(`Unsupported \`config language\` action: \`${languageAction}\`.`, {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: ["Use one of: set, get."],
    });
  }

  throw new CliError(`Unsupported config action: \`${action}\`.`, {
    code: "CLI_CONTRACT_VIOLATION",
    exitCode: 2,
    guidance: ["Use one of: set, get, list, provider, language."],
  });
}
