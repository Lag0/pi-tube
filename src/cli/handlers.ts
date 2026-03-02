import { CliError, CliPlannedFeatureError } from "../errors/cli-errors.ts";
import { resolveSource } from "../intake/resolver.ts";
import { buildOutputArtifact } from "../output/build-artifact.ts";
import { renderJson } from "../output/json.ts";
import { renderMarkdown } from "../output/markdown.ts";
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
