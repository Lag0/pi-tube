import { CliError, CliPlannedFeatureError } from "../errors/cli-errors.ts";
import { resolveSource } from "../intake/resolver.ts";
import { buildOutputArtifact } from "../output/build-artifact.ts";
import { renderJson } from "../output/json.ts";
import { renderMarkdown } from "../output/markdown.ts";
import {
  getConfigValue,
  listConfigValues,
  resolveConfigPath,
  setConfigValue,
  type ConfigStoreOptions,
} from "../config/store.ts";
import type { ConfigKey } from "../config/types.ts";
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
  extraPositionals: string[];
  provider?: string;
  language?: string;
  transcriptionOptions?: Omit<TranscriptionServiceOptions, "provider" | "language">;
}

export interface BaselineIntakeResult {
  transcription: TranscriptionExecutionResult;
  json: boolean;
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
  };
}

export function formatBaselineIntakeResult(result: BaselineIntakeResult): string {
  const artifact = buildOutputArtifact(result.transcription);
  return result.json ? renderJson(artifact) : renderMarkdown(artifact);
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
  const supportedKeys = new Set([
    "defaults.provider",
    "defaults.language",
    "providers.deepgram.api_key",
    "providers.deepgram.api_key_env",
    "providers.groq.api_key",
    "providers.groq.api_key_env",
  ] as const);

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

export function handleConfigCommand({
  args,
  json,
  options,
}: ConfigCommandInput): string {
  const [action, ...rest] = args;
  const configPath = resolveConfigPath(options);

  if (!action) {
    throw new CliError("Missing `config` action. Use `set`, `get`, or `list`.", {
      code: "CLI_CONTRACT_VIOLATION",
      exitCode: 2,
      guidance: [
        "Use `pi-tube config list`.",
        "Use `pi-tube config get <key>`.",
        "Use `pi-tube config set <key> <value>`.",
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
    const values = listConfigValues(options);
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
    const value = getConfigValue(key, options);
    if (json) {
      return JSON.stringify(
        {
          command: "config",
          action: "get",
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

  if (action === "set") {
    const [rawKey, rawValue, ...extra] = rest;
    if (!rawKey || !rawValue || extra.length > 0) {
      throw new CliError("`config set` expects exactly `<key> <value>`.", {
        code: "CLI_CONTRACT_VIOLATION",
        exitCode: 2,
      });
    }

    const key = requireConfigKey(rawKey);
    setConfigValue(key, rawValue, options);
    const value = getConfigValue(key, { ...options, env: options?.env ?? process.env });

    if (json) {
      return JSON.stringify(
        {
          command: "config",
          action: "set",
          key,
          value,
          config_path: configPath,
        },
        null,
        2,
      );
    }

    return `[CONFIG_SET] key=${key} value=${asPrintableValue(value)} config_path=${configPath}`;
  }

  throw new CliError(`Unsupported config action: \`${action}\`.`, {
    code: "CLI_CONTRACT_VIOLATION",
    exitCode: 2,
    guidance: ["Use one of: set, get, list."],
  });
}
