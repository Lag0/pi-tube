import type { EnvironmentVariables, PiTubeConfig } from "../core/domain/config.ts";
import { downloadMedia } from "../download/service.ts";
import type { DownloadResult } from "../download/types.ts";
import { CliError } from "../errors/cli-errors.ts";
import { resolveSource } from "../intake/resolver.ts";
import { buildOutputArtifact } from "../output/build-artifact.ts";
import { renderJson } from "../output/json.ts";
import { renderMarkdown } from "../output/markdown.ts";
import { transcribeFromResolvedSource } from "../transcription/service.ts";
import type { TranscriptionExecutionResult } from "../transcription/types.ts";
import { type PersistedOutputArtifact, persistOutputArtifact } from "./persist-output.ts";

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
  config: PiTubeConfig;
  env: EnvironmentVariables;
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
  config,
  env,
  onProgress,
}: BaselineInput): Promise<BaselineIntakeResult> {
  if (extraPositionals.length > 0) {
    throw new CliError("Only one positional input is supported in Phase 2.", {
      code: "INPUT_INVALID",
      guidance: [
        "Use one of: `pi-tube transcribe <input>`, `pi-tube transcribe <input> --provider <deepgram|groq|elevenlabs>`, `pi-tube transcribe <input> --json`.",
      ],
    });
  }

  onProgress?.({ label: "Resolving source..." });
  const source = await resolveSource(input);

  const sourceDetail =
    source.kind === "youtube" || source.kind === "instagram"
      ? (source.title ?? source.kind)
      : source.kind === "local_file"
        ? source.kind
        : "direct url";

  onProgress?.({ label: "Transcribing audio...", detail: `(${sourceDetail})` });
  const transcription = await transcribeFromResolvedSource(source, { provider, language, config, env });

  return {
    transcription,
    json,
    timestamps,
  };
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
      code: "INPUT_INVALID",
      guidance: [
        "Use one of: `pi-tube download <url>`, `pi-tube download <url> --audio`, `pi-tube download <url> --output <dir>`.",
      ],
    });
  }

  if (extraPositionals.length > 0) {
    throw new CliError("`download` accepts exactly one URL input.", {
      code: "INPUT_INVALID",
      guidance: [
        "Use one of: `pi-tube download <url>`, `pi-tube download <url> --audio`, `pi-tube download <url> --output <dir>`.",
      ],
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
