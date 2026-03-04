import { CliError, CliPlannedFeatureError } from "../errors/cli-errors.ts";
import { resolveSource } from "../intake/resolver.ts";
import { buildOutputArtifact } from "../output/build-artifact.ts";
import { renderJson } from "../output/json.ts";
import { renderMarkdown } from "../output/markdown.ts";
import { persistOutputArtifact, type PersistedOutputArtifact } from "./persist-output.ts";
import {
  getConfigValue,
  isConfigProviderId,
  listConfigValues,
  resolveConfigPath,
  setConfigValue,
  type ConfigStoreOptions,
} from "../config/store.ts";
import { CONFIG_KEYS, type ConfigKey } from "../config/types.ts";
import {
  getDefaultProviderRegistry,
  TRANSCRIPTION_PROVIDER_DEFINITIONS,
  type ProviderRegistry,
} from "../transcription/providers/index.ts";
import {
  transcribeFromResolvedSource,
  type TranscriptionServiceOptions,
} from "../transcription/service.ts";
import type { TranscriptionExecutionResult } from "../transcription/types.ts";

const DEFERRED_COMMAND_PHASE: Record<string, string> = {
  youtube: "Phase 2",
  instagram: "Phase 3",
};

export interface BaselineInput {
  input: string;
  json: boolean;
  timestamps: boolean;
  extraPositionals: string[];
  provider?: string;
  language?: string;
  transcriptionOptions?: Omit<TranscriptionServiceOptions, "provider" | "language">;
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

export interface ProviderStatusInput {
  json: boolean;
  env?: Record<string, string | undefined>;
  providers?: ProviderRegistry;
}

interface ProviderStatusEntry {
  id: string;
  registered: boolean;
  configured: boolean;
  required_env: string[];
  missing_env: string[];
}

interface ConfigCommandInput {
  args: string[];
  json: boolean;
  options?: ConfigStoreOptions;
}

export function isDeferredCommand(command: string): boolean {
  return command in DEFERRED_COMMAND_PHASE;
}

export function handleDeferredCommand(command: string, json: boolean): never {
  const phase = DEFERRED_COMMAND_PHASE[command] ?? "a future phase";
  const guidance = [
    "Current implemented contract: `pi-tube <input>`.",
    "Core source intake runs through this baseline input path in Phase 2.",
    "Use `pi-tube --help` for the latest command roadmap.",
  ];

  if (json) {
    guidance.push("Use `pi-tube --json <input>` with baseline input mode for deterministic JSON output.");
  }

  throw new CliPlannedFeatureError(`\`${command}\` command`, phase, guidance);
}

export async function handleBaselineInput({
  input,
  json,
  timestamps,
  extraPositionals,
  provider,
  language,
  transcriptionOptions,
}: BaselineInput): Promise<BaselineIntakeResult> {
  if (extraPositionals.length > 0) {
    throw new CliError("Only one positional input is supported in Phase 2.", {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: [
        "Use exactly one positional input: `pi-tube <input>`.",
        "Run `pi-tube --help` for examples.",
      ],
    });
  }

  const source = await resolveSource(input);
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

function buildProviderStatusEntries({
  env = process.env,
  providers = getDefaultProviderRegistry(),
}: Omit<ProviderStatusInput, "json">): ProviderStatusEntry[] {
  return TRANSCRIPTION_PROVIDER_DEFINITIONS.map((definition) => {
    const missingEnv = definition.requiredEnv.filter((key) => {
      const value = env[key];
      return typeof value !== "string" || value.trim().length === 0;
    });

    return {
      id: definition.id,
      registered: Boolean(providers[definition.id]),
      configured: missingEnv.length === 0,
      required_env: [...definition.requiredEnv],
      missing_env: missingEnv,
    };
  });
}

function formatProviderStatusText(entries: ProviderStatusEntry[]): string {
  const lines = ["[PROVIDER_STATUS]"];
  for (const entry of entries) {
    lines.push(
      `${entry.id} registered=${entry.registered} configured=${entry.configured} required_env=${entry.required_env.join(",")} missing_env=${entry.missing_env.join(",") || "-"}`,
    );
  }
  return lines.join("\n");
}

export function handleProviderStatus(input: ProviderStatusInput): string {
  const entries = buildProviderStatusEntries(input);
  if (input.json) {
    return JSON.stringify(
      {
        command: "provider-status",
        providers: entries,
      },
      null,
      2,
    );
  }

  return formatProviderStatusText(entries);
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

function formatConfigListText(configPath: string, values: Record<string, unknown>): string {
  const lines = ["[CONFIG_LIST]", `config_path=${configPath}`];
  for (const [key, value] of Object.entries(values)) {
    lines.push(`${key}=${asPrintableValue(value)}`);
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

function requireConfigProviderId(input: string): "deepgram" | "groq" {
  const normalized = input.trim().toLowerCase();
  if (isConfigProviderId(normalized)) {
    return normalized;
  }

  throw new CliError(`Unsupported provider: \`${input}\`.`, {
    code: "CLI_CONTRACT_VIOLATION",
    exitCode: 2,
    guidance: ["Use one of: deepgram, groq."],
  });
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
        value: value ?? null,
        config_path: configPath,
      },
      null,
      2,
    );
  }

  return `[CONFIG_GET] key=${key} value=${asPrintableValue(value)} config_path=${configPath}`;
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
        value: value ?? null,
        config_path: configPath,
      },
      null,
      2,
    );
  }

  return `[CONFIG_SET] key=${key} value=${asPrintableValue(value)} config_path=${configPath}`;
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
        "Use `pi-tube config provider set <deepgram|groq>`.",
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
          guidance: ["Use `pi-tube config provider set <deepgram|groq>`."],
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
      const key = providerAction === "env"
        ? (`providers.${providerId}.api_key_env` as ConfigKey)
        : (`providers.${providerId}.api_key` as ConfigKey);
      withConfigValidation(() => setConfigValue(key, valueInput, options));
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
