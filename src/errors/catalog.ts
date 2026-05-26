export interface ErrorCatalogEntry {
  exitCode: number;
  guidance: readonly string[];
}

export const ERROR_CATALOG = {
  CLI_CONTRACT_VIOLATION: {
    exitCode: 2,
    guidance: ["Run `pi-tube --help` to view supported usage."],
  },
  CLI_LEGACY_COMPAT: {
    exitCode: 2,
    guidance: ["Use `pi-tube --help` for the current Bun/TS contract."],
  },
  CLI_NOT_IMPLEMENTED: {
    exitCode: 2,
    guidance: ["Use `pi-tube --help` for active commands."],
  },
  SETUP_COMMAND_FAILED: {
    exitCode: 2,
    guidance: ["Retry setup command after validating local toolchain availability."],
  },
  INTAKE_CLASSIFICATION_FAILED: {
    exitCode: 2,
    guidance: ["Retry with a supported input source or run `pi-tube --help`."],
  },
  UNSUPPORTED_URL_NOT_DIRECT_MEDIA: {
    exitCode: 2,
    guidance: ["Use a direct media URL or a supported source type."],
  },
  YOUTUBE_URL_INVALID: {
    exitCode: 2,
    guidance: ["Use a valid public YouTube watch, short, or share URL."],
  },
  YTDLP_NOT_FOUND: {
    exitCode: 2,
    guidance: ["Install yt-dlp and ensure it is available on PATH, or run `pi-tube setup yt-dlp` for guidance."],
  },
  YOUTUBE_EXTRACT_FAILED: {
    exitCode: 2,
    guidance: ["Retry with a valid public YouTube URL."],
  },
  YTDLP_OUTPUT_INVALID: {
    exitCode: 2,
    guidance: ["Update yt-dlp and retry."],
  },
  INSTAGRAM_URL_INVALID: {
    exitCode: 2,
    guidance: ["Use a public Instagram post/reel/video URL."],
  },
  INSTAGRAM_AUTH_REQUIRED: {
    exitCode: 2,
    guidance: ["Use a publicly accessible Instagram post/reel/video URL and retry."],
  },
  INSTAGRAM_EXTRACT_FAILED: {
    exitCode: 2,
    guidance: ["Try again with a valid public Instagram URL."],
  },
  LOCAL_FILE_NOT_FOUND: {
    exitCode: 2,
    guidance: ["Check the file path and try again."],
  },
  LOCAL_FILE_UNSUPPORTED_EXTENSION: {
    exitCode: 2,
    guidance: ["Use a supported audio/video file extension."],
  },
  DOWNLOAD_FAILED: {
    exitCode: 2,
    guidance: ["Retry with a valid public YouTube or Instagram URL."],
  },
  TRANSCRIPTION_PROVIDER_INVALID: {
    exitCode: 2,
    guidance: ["Use `deepgram` or `groq`."],
  },
  TRANSCRIPTION_PROVIDER_NOT_CONFIGURED: {
    exitCode: 2,
    guidance: [
      "Configure at least one provider credential (`pi-tube auth login <provider>`).",
      "Run `pi-tube auth status` to inspect missing credentials.",
    ],
  },
  TRANSCRIPTION_PROVIDER_AUTH: {
    exitCode: 2,
    guidance: ["Check provider credentials and retry."],
  },
  TRANSCRIPTION_PROVIDER_RATE_LIMIT: {
    exitCode: 2,
    guidance: ["Retry after backoff or switch providers."],
  },
  TRANSCRIPTION_PROVIDER_UNAVAILABLE: {
    exitCode: 2,
    guidance: ["Retry later or switch providers."],
  },
  TRANSCRIPTION_PROVIDER_FAILED: {
    exitCode: 2,
    guidance: ["Retry the command or inspect provider status and credentials."],
  },
  TRANSCRIPTION_PROVIDER_INVALID_RESPONSE: {
    exitCode: 2,
    guidance: ["Retry the command. If the issue persists, switch providers."],
  },
} as const satisfies Record<string, ErrorCatalogEntry>;

export type ErrorCode = keyof typeof ERROR_CATALOG;

export function getErrorCatalogEntry(code: ErrorCode): ErrorCatalogEntry {
  return ERROR_CATALOG[code];
}
