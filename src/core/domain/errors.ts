/** Error categories; each adapter maps a category to its own signal (CLI exit code, MCP error). */
export type ErrorCategory = "usage" | "config" | "dependency" | "provider" | "source" | "cancelled" | "unexpected";

interface ErrorCatalogEntry {
  readonly category: ErrorCategory;
  readonly hint: string;
}

/** Every public error code, with its category and the default remediation hint. */
export const ERROR_CATALOG = {
  INPUT_INVALID: {
    category: "usage",
    hint: "Run `pi-tube --help` to see supported usage.",
  },
  NOT_IMPLEMENTED: {
    category: "usage",
    hint: "Run `pi-tube --help` to see available commands.",
  },
  PROVIDER_INVALID: {
    category: "usage",
    hint: "Run `pi-tube providers` to list supported providers.",
  },
  UNEXPECTED: {
    category: "unexpected",
    hint: "This is a pi-tube bug. Report it at https://github.com/Lag0/pi-tube/issues with the command you ran.",
  },
  CONFIG_INVALID: {
    category: "config",
    hint: "Fix the file by hand or move it aside; pi-tube never overwrites a config it cannot parse.",
  },
  CONFIG_IO_FAILED: {
    category: "config",
    hint: "Check that your user can read and write the config file and its directory.",
  },
  COOKIES_FILE_INVALID: {
    category: "config",
    hint: "Point `cookies.file` (or PI_TUBE_COOKIES_FILE) at a readable cookies.txt in Netscape format, given as an absolute path.",
  },
  CANCELLED: {
    category: "cancelled",
    hint: "Run the command again to retry.",
  },
  STORAGE_IO_FAILED: {
    category: "config",
    hint: "Check that your user can write to the output directory, or pass --output with another directory.",
  },
  SETUP_COMMAND_FAILED: {
    category: "dependency",
    hint: "Check the command output above and run it manually.",
  },
  YTDLP_NOT_FOUND: {
    category: "dependency",
    hint: "Install yt-dlp (`brew install yt-dlp` or `pipx install yt-dlp`) and make sure it is on PATH.",
  },
  YTDLP_OUTPUT_INVALID: {
    category: "dependency",
    hint: "Update yt-dlp (`yt-dlp -U`, `brew upgrade yt-dlp` or `pipx upgrade yt-dlp`) and retry.",
  },
  PROVIDER_NOT_CONFIGURED: {
    category: "provider",
    hint: "Run `pi-tube auth login <provider>` or set the provider API key env var; `pi-tube providers` shows what is missing.",
  },
  PROVIDER_AUTH: {
    category: "provider",
    hint: "Check the key with `pi-tube providers`, then run `pi-tube auth login <provider>` again.",
  },
  PROVIDER_RATE_LIMIT: {
    category: "provider",
    hint: "Wait and retry, or pass `--provider` with another configured provider.",
  },
  PROVIDER_UNAVAILABLE: {
    category: "provider",
    hint: "Retry later, or pass `--provider` with another configured provider.",
  },
  PROVIDER_FAILED: {
    category: "provider",
    hint: "Retry; if it keeps failing, pass `--provider` with another configured provider.",
  },
  PROVIDER_INVALID_RESPONSE: {
    category: "provider",
    hint: "Retry; if it keeps failing, pass `--provider` with another configured provider.",
  },
  UNSUPPORTED_URL_NOT_DIRECT_MEDIA: {
    category: "source",
    hint: "Pass a YouTube or Instagram URL, a direct media URL (.mp3, .mp4, ...) or a local file.",
  },
  YOUTUBE_EXTRACT_FAILED: {
    category: "source",
    hint: "Check that the video is public and opens in a browser, then retry.",
  },
  INSTAGRAM_AUTH_REQUIRED: {
    category: "source",
    hint: "pi-tube supports public Instagram URLs only.",
  },
  INSTAGRAM_EXTRACT_FAILED: {
    category: "source",
    hint: "Check that the post is public and opens in a browser, then retry.",
  },
  LOCAL_FILE_NOT_FOUND: {
    category: "source",
    hint: "Check the file path and retry.",
  },
  LOCAL_FILE_UNSUPPORTED_EXTENSION: {
    category: "source",
    hint: "Use an audio or video file (.mp3, .wav, .m4a, .mp4, .mov, ...).",
  },
  DOWNLOAD_FAILED: {
    category: "source",
    hint: "Check that the URL is a public YouTube or Instagram video and retry.",
  },
} as const satisfies Record<string, ErrorCatalogEntry>;

/** A public error code; stable across the CLI and the MCP server. */
export type ErrorCode = keyof typeof ERROR_CATALOG;

/** A business failure: what went wrong and what the user can do about it. */
export interface PiTubeError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly hint: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/** Builds a `PiTubeError`; the hint defaults to the catalog hint for `code`. */
export const createError = (
  code: ErrorCode,
  message: string,
  options: { readonly hint?: string; readonly details?: Readonly<Record<string, unknown>> } = {},
): PiTubeError => ({
  code,
  message,
  hint: options.hint ?? ERROR_CATALOG[code].hint,
  ...(options.details ? { details: options.details } : {}),
});

/** Returns the category of `code`. */
export const getErrorCategory = (code: ErrorCode): ErrorCategory => ERROR_CATALOG[code].category;

/** Tells whether `value` is a known error code. */
export const isErrorCode = (value: unknown): value is ErrorCode =>
  typeof value === "string" && Object.hasOwn(ERROR_CATALOG, value);

/**
 * Normalizes anything thrown into a `PiTubeError`. An `Error` carrying a known `code` and a string
 * `hint` (such as the CLI adapter's `CliFailure`) keeps both; anything else becomes `UNEXPECTED`, without a stack.
 */
export const toPiTubeError = (error: unknown): PiTubeError => {
  if (error instanceof Error) {
    const code = "code" in error ? error.code : undefined;
    const hint = "hint" in error ? error.hint : undefined;
    if (isErrorCode(code) && typeof hint === "string") {
      return createError(code, error.message, { hint });
    }
    return createError("UNEXPECTED", error.message || "Unexpected failure.");
  }
  return createError("UNEXPECTED", "Unexpected failure.");
};
