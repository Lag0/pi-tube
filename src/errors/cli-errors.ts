import { ERROR_CATALOG, type ErrorCode } from "../core/domain/errors.ts";

export class CliError extends Error {
  public readonly code: ErrorCode;
  public readonly hint: string;

  constructor(message: string, options: { code: ErrorCode; guidance?: readonly string[] }) {
    super(message);
    this.name = "CliError";
    this.code = options.code;
    const guidance = (options.guidance ?? [])
      .map((line) => line.trim())
      .filter((line, index, all) => line.length > 0 && all.indexOf(line) === index);
    this.hint = guidance.length > 0 ? guidance.join(" ") : ERROR_CATALOG[options.code].hint;
  }
}

export function createTranscriptionProviderNotConfiguredError(provider: string): CliError {
  return new CliError(`Provider \`${provider}\` is not configured yet.`, {
    code: "PROVIDER_NOT_CONFIGURED",
    guidance: [
      `Configure credentials for \`${provider}\` via \`pi-tube auth login ${provider}\`.`,
      "Run `pi-tube auth status` to inspect missing credentials.",
    ],
  });
}

export function createTranscriptionProviderAuthError(provider: string, detail?: string): CliError {
  const suffix = detail ? ` (${detail})` : "";
  return new CliError(`Transcription provider authentication failed for \`${provider}\`${suffix}.`, {
    code: "PROVIDER_AUTH",
    guidance: [
      `Check ${provider.toUpperCase()} API credentials and retry.`,
      "Verify API key environment configuration.",
    ],
  });
}

export function createTranscriptionProviderRateLimitError(provider: string, detail?: string): CliError {
  const suffix = detail ? ` (${detail})` : "";
  return new CliError(`Transcription provider rate limit reached for \`${provider}\`${suffix}.`, {
    code: "PROVIDER_RATE_LIMIT",
    guidance: ["Retry after backoff or switch to another provider."],
  });
}

export function createTranscriptionProviderUnavailableError(provider: string, detail?: string): CliError {
  const suffix = detail ? ` (${detail})` : "";
  return new CliError(`Transcription provider \`${provider}\` is unavailable${suffix}.`, {
    code: "PROVIDER_UNAVAILABLE",
    guidance: ["Retry later or switch to another provider."],
  });
}

export function createTranscriptionProviderFailedError(provider: string, detail?: string): CliError {
  const suffix = detail ? ` (${detail})` : "";
  return new CliError(`Transcription failed for provider \`${provider}\`${suffix}.`, {
    code: "PROVIDER_FAILED",
    guidance: ["Retry the command or inspect provider status and credentials."],
  });
}

export function createTranscriptionProviderInvalidResponseError(provider: string): CliError {
  return new CliError(`Provider \`${provider}\` returned an invalid transcription response.`, {
    code: "PROVIDER_INVALID_RESPONSE",
    guidance: ["Retry the command. If the issue persists, switch providers."],
  });
}

export function createUnsupportedUrlNotDirectMediaError(input: string): CliError {
  return new CliError(`Input URL is not a direct media URL: \`${input}\`.`, {
    code: "UNSUPPORTED_URL_NOT_DIRECT_MEDIA",
    guidance: [
      "Use a direct media URL ending in a supported extension (for example .mp3 or .mp4).",
      "For webpage URLs, provide the underlying downloadable media URL instead.",
    ],
  });
}

export function createYtDlpNotFoundError(): CliError {
  return new CliError("`yt-dlp` is required to process YouTube/Instagram URLs but was not found.", {
    code: "YTDLP_NOT_FOUND",
    guidance: [
      "Install yt-dlp and ensure it is available on PATH.",
      "macOS/Homebrew: `brew install yt-dlp`.",
      "Python/pipx: `pipx install yt-dlp`.",
      "Or run `pi-tube setup yt-dlp` for setup guidance.",
    ],
  });
}

export function createYouTubeExtractFailedError(detail?: string): CliError {
  const suffix = detail ? ` (${detail})` : "";
  return new CliError(`Failed to resolve YouTube media via yt-dlp${suffix}.`, {
    code: "YOUTUBE_EXTRACT_FAILED",
    guidance: ["Try again with a valid public YouTube URL."],
  });
}

export function createYtDlpMalformedOutputError(): CliError {
  return new CliError("yt-dlp returned malformed output.", {
    code: "YTDLP_OUTPUT_INVALID",
    guidance: ["Update yt-dlp and retry."],
  });
}

export function createInstagramUrlInvalidError(input: string): CliError {
  return new CliError(`Input is not a supported Instagram public URL: \`${input}\`.`, {
    code: "INSTAGRAM_URL_INVALID",
    guidance: ["Use a public Instagram post/reel/video URL."],
  });
}

export function createInstagramAuthRequiredError(input?: string): CliError {
  const detail = input ? ` for \`${input}\`` : "";
  return new CliError(`Instagram URL requires authentication${detail}.`, {
    code: "INSTAGRAM_AUTH_REQUIRED",
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
    guidance: ["Try again with a valid public Instagram URL."],
  });
}

export function createLocalFileNotFoundError(filePath: string): CliError {
  return new CliError(`Local file not found: \`${filePath}\`.`, {
    code: "LOCAL_FILE_NOT_FOUND",
    guidance: ["Check the file path and try again."],
  });
}

export function createUnsupportedLocalFileExtensionError(filePath: string): CliError {
  return new CliError(`Local file extension is not supported: \`${filePath}\`.`, {
    code: "LOCAL_FILE_UNSUPPORTED_EXTENSION",
    guidance: ["Use a supported audio/video format (for example .mp3, .wav, .m4a, .mp4, .mov)."],
  });
}

export function createDownloadFailedError(detail?: string): CliError {
  const suffix = detail ? ` (${detail})` : "";
  return new CliError(`Failed to download media via yt-dlp${suffix}.`, {
    code: "DOWNLOAD_FAILED",
    guidance: ["Retry with a valid public YouTube or Instagram URL."],
  });
}
