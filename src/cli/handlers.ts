import { CliError, CliPlannedFeatureError } from "../errors/cli-errors.ts";
import { resolveSource } from "../intake/resolver.ts";
import type { ResolvedSource } from "../intake/types.ts";
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
  source: ResolvedSource;
  transcription: TranscriptionExecutionResult;
  notes: string[];
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
    guidance.push("`--json` output mode is planned for Phase 5.");
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

  if (json) {
    throw new CliPlannedFeatureError("`--json` output mode", "Phase 5", [
      "Run without `--json` for active Phase 4 transcription behavior.",
      "Use `--provider` / `--language` options with baseline input mode.",
    ]);
  }

  const source = await resolveSource(input);
  const transcription = await transcribeFromResolvedSource(source, {
    ...transcriptionOptions,
    provider,
    language,
  });

  return {
    source,
    transcription,
    notes: [
      "Source intake complete.",
      "Transcription provider execution complete.",
    ],
  };
}

export function formatBaselineIntakeResult(result: BaselineIntakeResult): string {
  const lines = [`[INTAKE_RESOLVED] kind=${result.source.kind}`];

  switch (result.source.kind) {
    case "youtube":
      lines.push(`media_url=${result.source.mediaUrl}`);
      if (result.source.title) {
        lines.push(`title=${result.source.title}`);
      }
      break;
    case "instagram":
      lines.push(`media_url=${result.source.mediaUrl}`);
      if (result.source.title) {
        lines.push(`title=${result.source.title}`);
      }
      break;
    case "direct_url":
      lines.push(`media_url=${result.source.mediaUrl}`);
      lines.push(`extension=${result.source.extension}`);
      break;
    case "local_file":
      lines.push(`absolute_path=${result.source.absolutePath}`);
      lines.push(`extension=${result.source.extension}`);
      break;
  }

  lines.push(`[TRANSCRIPTION_RESOLVED] provider=${result.transcription.provider}`);
  if (result.transcription.requestedLanguage) {
    lines.push(`requested_language=${result.transcription.requestedLanguage}`);
  }
  if (result.transcription.detectedLanguage) {
    lines.push(`detected_language=${result.transcription.detectedLanguage}`);
  }
  lines.push(`transcript=${result.transcription.transcript}`);

  for (const note of result.notes) {
    lines.push(`- ${note}`);
  }

  return lines.join("\n");
}
