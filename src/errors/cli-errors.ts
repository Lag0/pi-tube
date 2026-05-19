import { getErrorCatalogEntry, type ErrorCode } from "./catalog.ts";

export class CliError extends Error {
  public readonly code: ErrorCode;
  public readonly exitCode: number;
  public readonly guidance: string[];

  constructor(message: string, options: { code: ErrorCode; exitCode?: number; guidance?: string[] }) {
    super(message);
    const catalog = getErrorCatalogEntry(options.code);
    this.name = "CliError";
    this.code = options.code;
    const resolvedExitCode = options.exitCode ?? catalog.exitCode;
    this.exitCode = Number.isInteger(resolvedExitCode) && resolvedExitCode > 0
      ? resolvedExitCode
      : catalog.exitCode;
    const guidance = options.guidance ?? [...catalog.guidance];
    this.guidance = guidance
      .map((line) => line.trim())
      .filter((line, index, all) => line.length > 0 && all.indexOf(line) === index);
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

export function createTranscriptionProviderNotConfiguredError(provider: string): CliError {
  return new CliError(`Provider \`${provider}\` is not configured yet.`, {
    code: "TRANSCRIPTION_PROVIDER_NOT_CONFIGURED",
    exitCode: 2,
    guidance: [
      `Configure credentials for \`${provider}\` via \`pi-tube config provider env ${provider} <ENV_VAR>\`.`,
      "Run `pi-tube provider-status` to inspect missing credentials.",
    ],
  });
}

export function createTranscriptionProviderAuthError(provider: string, detail?: string): CliError {
  const suffix = detail ? ` (${detail})` : "";
  return new CliError(`Transcription provider authentication failed for \`${provider}\`${suffix}.`, {
    code: "TRANSCRIPTION_PROVIDER_AUTH",
    exitCode: 2,
    guidance: [
      `Check ${provider.toUpperCase()} API credentials and retry.`,
      "Verify API key environment configuration.",
    ],
  });
}

export function createTranscriptionProviderRateLimitError(provider: string, detail?: string): CliError {
  const suffix = detail ? ` (${detail})` : "";
  return new CliError(`Transcription provider rate limit reached for \`${provider}\`${suffix}.`, {
    code: "TRANSCRIPTION_PROVIDER_RATE_LIMIT",
    exitCode: 2,
    guidance: ["Retry after backoff or switch to another provider."],
  });
}

export function createTranscriptionProviderUnavailableError(provider: string, detail?: string): CliError {
  const suffix = detail ? ` (${detail})` : "";
  return new CliError(`Transcription provider \`${provider}\` is unavailable${suffix}.`, {
    code: "TRANSCRIPTION_PROVIDER_UNAVAILABLE",
    exitCode: 2,
    guidance: ["Retry later or switch to another provider."],
  });
}

export function createTranscriptionProviderFailedError(provider: string, detail?: string): CliError {
  const suffix = detail ? ` (${detail})` : "";
  return new CliError(`Transcription failed for provider \`${provider}\`${suffix}.`, {
    code: "TRANSCRIPTION_PROVIDER_FAILED",
    exitCode: 2,
    guidance: ["Retry the command or inspect provider status and credentials."],
  });
}

export function createTranscriptionProviderInvalidResponseError(provider: string): CliError {
  return new CliError(`Provider \`${provider}\` returned an invalid transcription response.`, {
    code: "TRANSCRIPTION_PROVIDER_INVALID_RESPONSE",
    exitCode: 2,
    guidance: ["Retry the command. If the issue persists, switch providers."],
  });
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

export function createInstagramUrlInvalidError(input: string): CliError {
  return new CliError(`Input is not a supported Instagram public URL: \`${input}\`.`, {
    code: "INSTAGRAM_URL_INVALID",
    exitCode: 2,
    guidance: ["Use a public Instagram post/reel/video URL."],
  });
}

export function createInstagramAuthRequiredError(input?: string): CliError {
  const detail = input ? ` for \`${input}\`` : "";
  return new CliError(`Instagram URL requires authentication${detail}.`, {
    code: "INSTAGRAM_AUTH_REQUIRED",
    exitCode: 2,
    guidance: [
      "This CLI supports Instagram public URLs only.",
      "Use a publicly accessible Instagram post/reel/video URL and retry.",
    ],
  });
}

export function createInstagramExtractFailedError(detail?: string): CliError {
  const suffix = detail ? ` (${detail})` : "";
  return new CliError(`Failed to resolve Instagram media via yt-dlp${suffix}.`, {
    code: "INSTAGRAM_EXTRACT_FAILED",
    exitCode: 2,
    guidance: ["Try again with a valid public Instagram URL."],
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

export function createDownloadFailedError(detail?: string): CliError {
  const suffix = detail ? ` (${detail})` : "";
  return new CliError(`Failed to download media via yt-dlp${suffix}.`, {
    code: "DOWNLOAD_FAILED",
    exitCode: 2,
    guidance: ["Retry with a valid public YouTube or Instagram URL."],
  });
}

export function formatCliError(error: unknown): { message: string; exitCode: number } {
  if (error instanceof CliError) {
    const lines = [`[${error.code}] ${error.message}`];
    for (const tip of error.guidance) {
      lines.push(`guidance: ${tip}`);
    }
    return { message: lines.join("\n"), exitCode: error.exitCode };
  }

  const fallback = error instanceof Error ? error.message : "Unexpected CLI failure";
  return { message: `[CLI_UNEXPECTED] ${fallback}`, exitCode: 1 };
}
