import { pathToFileURL } from "node:url";
import { createError, sourceReferenceOf, type TranscribeOutput } from "../../../core/index.ts";
import { CliFailure, unwrapOrFail } from "../error-output.ts";
import type { CliDeps } from "../io.ts";
import { createProgressReporter } from "../progress.ts";
import { hintForCommand } from "../usage-hints.ts";

export interface TranscribeCommand {
  readonly input?: string;
  readonly extraPositionals: readonly string[];
  readonly provider?: string;
  readonly language?: string;
  readonly force: boolean;
  readonly json: boolean;
  readonly color: boolean;
}

/** The `--json` stdout object: a summary of the result, without the full text (it is in the saved file). */
export const toTranscribeJson = (output: TranscribeOutput) => {
  const { artifact } = output;
  const outputPath = output.format === "json" ? output.paths.json : output.paths.markdown;
  return {
    output_path: outputPath,
    output_uri: pathToFileURL(outputPath).href,
    markdown_path: output.paths.markdown,
    transcript_id: output.transcriptId,
    cache_hit: output.cacheHit,
    format: output.format,
    provider: artifact.transcription.provider,
    source: {
      kind: artifact.source.kind,
      reference: sourceReferenceOf(artifact.source),
      title: artifact.source.title ?? null,
      platform: artifact.source.platform ?? null,
      tier: artifact.source.tier,
    },
    requested_language: artifact.transcription.requested_language ?? null,
    detected_language: artifact.transcription.detected_language ?? null,
    summary: artifact.summary,
    characters: artifact.transcript.full_text.length,
    segments: artifact.transcript.segments?.length ?? 0,
  };
};

const usageError = (message: string): CliFailure =>
  new CliFailure(createError("INPUT_INVALID", message, { hint: hintForCommand("transcribe") }));

/** `pi-tube transcribe <input>`: human output is the saved file path; `--json` prints the result object. */
export const runTranscribe = async (deps: CliDeps, command: TranscribeCommand): Promise<number> => {
  if (!command.input?.trim()) throw usageError("Missing input.");
  if (command.extraPositionals.length > 0) throw usageError("`transcribe` accepts exactly one input.");

  const progress = createProgressReporter({ color: command.color, stream: deps.io.progressStream });
  const startTime = Date.now();
  const result = await deps.app
    .transcribe(
      {
        input: command.input,
        provider: command.provider,
        language: command.language,
        force: command.force,
        format: command.json ? "json" : "markdown",
      },
      { onProgress: (step) => progress.update(step), signal: deps.listenForCancel?.() },
    )
    .catch((error: unknown) => {
      progress.fail("Failed");
      throw error;
    });
  if (!result.success) progress.fail("Failed");
  const output = unwrapOrFail(result);
  const outputPath = output.format === "json" ? output.paths.json : output.paths.markdown;
  progress.succeed(outputPath, Date.now() - startTime);

  if (command.json) {
    deps.io.writeOut(JSON.stringify(toTranscribeJson(output), null, 2));
    return 0;
  }
  deps.io.writeOut(`[OUTPUT_FILE] ${outputPath}`);
  deps.io.writeOut(`[OUTPUT_FILE_URI] ${pathToFileURL(outputPath).href}`);
  deps.io.writeOut(`[TRANSCRIPT_ID] ${output.transcriptId}`);
  deps.io.writeOut(`[CACHE_HIT] ${output.cacheHit}`);
  return 0;
};
