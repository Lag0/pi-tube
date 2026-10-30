import { downloadMedia } from "../download/service.ts";
import type { DownloadResult } from "../download/types.ts";
import { CliError } from "../errors/cli-errors.ts";

export interface ProgressStep {
  label: string;
  detail?: string;
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
