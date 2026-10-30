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
  readonly timestamps: boolean;
  readonly json: boolean;
  readonly color: boolean;
}

/** The `--json` stdout object: a summary of the result, without the full text (it is in the saved file). */
export const toTranscribeJson = (output: TranscribeOutput) => {
  const { artifact } = output;
  return {
    output_path: output.saved.path,
    output_uri: output.saved.uri,
    format: output.format,
    provider: artifact.transcription.provider,
    source: {
      kind: artifact.source.kind,
      reference: sourceReferenceOf(artifact.source),
      title: artifact.source.title ?? null,
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
  const result = await deps.app.transcribe(
    {
      input: command.input,
      provider: command.provider,
      language: command.language,
      timestamps: command.timestamps,
      format: command.json ? "json" : "markdown",
    },
    { onProgress: (step) => progress.update(step), signal: deps.signal },
  );
  if (!result.success) progress.fail("Failed");
  const output = unwrapOrFail(result);
  progress.succeed(output.saved.path, Date.now() - startTime);

  if (command.json) {
    deps.io.writeOut(JSON.stringify(toTranscribeJson(output), null, 2));
    return 0;
  }
  deps.io.writeOut(`[OUTPUT_FILE] ${output.saved.path}`);
  deps.io.writeOut(`[OUTPUT_FILE_URI] ${output.saved.uri}`);
  return 0;
};
