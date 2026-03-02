export class CliError extends Error {
  public readonly code: string;
  public readonly exitCode: number;
  public readonly guidance: string[];

  constructor(message: string, options: { code: string; exitCode?: number; guidance?: string[] }) {
    super(message);
    this.name = "CliError";
    this.code = options.code;
    this.exitCode = options.exitCode ?? 2;
    this.guidance = options.guidance ?? [];
  }
}

export class CliPlannedFeatureError extends CliError {
  constructor(feature: string, phase: string, guidance: string[] = []) {
    super(`${feature} is coming soon in ${phase}.`, {
      code: "CLI_NOT_IMPLEMENTED",
      exitCode: 2,
      guidance,
    });
    this.name = "CliPlannedFeatureError";
  }
}

export function createUnsupportedUrlNotDirectMediaError(input: string): CliError {
  return new CliError(`Input URL is not a direct media URL: \`${input}\`.`, {
    code: "UNSUPPORTED_URL_NOT_DIRECT_MEDIA",
    exitCode: 2,
    guidance: [
      "Use a direct media URL ending in a supported extension (for example .mp3 or .mp4).",
      "For webpage URLs, provide the underlying downloadable media URL instead.",
    ],
  });
}

export function createYtDlpNotFoundError(): CliError {
  return new CliError("`yt-dlp` is required to process YouTube URLs but was not found.", {
    code: "YTDLP_NOT_FOUND",
    exitCode: 2,
    guidance: [
      "Install yt-dlp and ensure it is available on PATH.",
      "Then retry the same `pi-tube <youtube-url>` command.",
    ],
  });
}

export function createYouTubeExtractFailedError(detail?: string): CliError {
  const suffix = detail ? ` (${detail})` : "";
  return new CliError(`Failed to resolve YouTube media via yt-dlp${suffix}.`, {
    code: "YOUTUBE_EXTRACT_FAILED",
    exitCode: 2,
    guidance: ["Try again with a valid public YouTube URL."],
  });
}

export function createYtDlpMalformedOutputError(): CliError {
  return new CliError("yt-dlp returned malformed output.", {
    code: "YTDLP_OUTPUT_INVALID",
    exitCode: 2,
    guidance: ["Update yt-dlp and retry."],
  });
}

export function createLocalFileNotFoundError(filePath: string): CliError {
  return new CliError(`Local file not found: \`${filePath}\`.`, {
    code: "LOCAL_FILE_NOT_FOUND",
    exitCode: 2,
    guidance: ["Check the file path and try again."],
  });
}

export function createUnsupportedLocalFileExtensionError(filePath: string): CliError {
  return new CliError(`Local file extension is not supported: \`${filePath}\`.`, {
    code: "LOCAL_FILE_UNSUPPORTED_EXTENSION",
    exitCode: 2,
    guidance: [
      "Use a supported audio/video format (for example .mp3, .wav, .m4a, .mp4, .mov).",
    ],
  });
}

export function formatCliError(error: unknown): { message: string; exitCode: number } {
  if (error instanceof CliError) {
    const lines = [`[${error.code}] ${error.message}`];
    for (const tip of error.guidance) {
      lines.push(`- ${tip}`);
    }
    return { message: lines.join("\n"), exitCode: error.exitCode };
  }

  const fallback = error instanceof Error ? error.message : "Unexpected CLI failure";
  return { message: `[CLI_UNEXPECTED] ${fallback}`, exitCode: 1 };
}
