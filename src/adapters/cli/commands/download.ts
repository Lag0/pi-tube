import { createError } from "../../../core/index.ts";
import { CliFailure, unwrapOrFail } from "../error-output.ts";
import type { CliDeps } from "../io.ts";
import { createProgressReporter } from "../progress.ts";
import { hintForCommand } from "../usage-hints.ts";

export interface DownloadCommand {
  readonly input?: string;
  readonly extraPositionals: readonly string[];
  readonly audio: boolean;
  readonly output?: string;
  readonly json: boolean;
  readonly color: boolean;
}

const usageError = (message: string): CliFailure =>
  new CliFailure(createError("INPUT_INVALID", message, { hint: hintForCommand("download") }));

/** `pi-tube download <url>`: into `~/.pi-tube/downloads` unless `--output` says otherwise. */
export const runDownload = async (deps: CliDeps, command: DownloadCommand): Promise<number> => {
  if (!command.input?.trim()) throw usageError("`download` expects a YouTube or Instagram URL.");
  if (command.extraPositionals.length > 0) throw usageError("`download` accepts exactly one URL input.");

  const progress = createProgressReporter({ color: command.color, stream: deps.io.progressStream });
  const startTime = Date.now();
  const result = await deps.app.downloadMedia(
    { input: command.input, media: command.audio ? "audio" : "video", outputDir: command.output },
    { onProgress: (step) => progress.update(step), signal: deps.signal },
  );
  if (!result.success) progress.fail("Failed");
  const downloaded = unwrapOrFail(result);
  progress.succeed(downloaded.path, Date.now() - startTime);

  if (command.json) {
    deps.io.writeOut(
      JSON.stringify(
        {
          output_path: downloaded.path,
          output_uri: downloaded.uri,
          source_kind: downloaded.sourceKind,
          media: downloaded.media,
        },
        null,
        2,
      ),
    );
    return 0;
  }
  deps.io.writeOut(`[DOWNLOAD_FILE] ${downloaded.path}`);
  deps.io.writeOut(`[DOWNLOAD_FILE_URI] ${downloaded.uri}`);
  return 0;
};
