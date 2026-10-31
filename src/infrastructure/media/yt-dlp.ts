import { createError, type PiTubeError } from "../../core/domain/errors.ts";
import { err, ok, type Result } from "../../core/domain/result.ts";
import type { ProcessResult } from "../process/run-process.ts";

/** Metadata pi-tube reads from `yt-dlp --dump-single-json`. */
export interface YtDlpResult {
  mediaUrl: string;
  title?: string;
  publishedAt?: string;
  description?: string;
  descriptionLinks?: string[];
}

/** What a yt-dlp run was for; decides which source error a failure maps to. */
export type YtDlpPurpose = "youtube_metadata" | "instagram_metadata" | "download";

export const METADATA_TIMEOUT_MS = 120_000;
export const MEDIA_TIMEOUT_MS = 1_800_000;
export const YTDLP_TIMEOUT_ENV = "PI_TUBE_YTDLP_TIMEOUT_MS";
export const AUDIO_FORMAT_SELECTOR = "bestaudio[ext=m4a]/bestaudio/best";
export const DOWNLOAD_TEMPLATE = "%(title).200B [%(id)s].%(ext)s";
// `--ignore-config`: a yt-dlp.conf in the cwd or output dir must never inject options such as `--exec`.
const BASE_ARGS = ["--ignore-config", "--no-warnings", "--no-playlist"] as const;

const malformedOutput = (): PiTubeError => createError("YTDLP_OUTPUT_INVALID", "yt-dlp returned malformed output.");

/** The longest delay `setTimeout` honours (about 24.8 days); a longer one fires at once. */
const MAX_TIMER_MS = 2_147_483_647;

/**
 * `PI_TUBE_YTDLP_TIMEOUT_MS`, when set to a positive whole number of milliseconds, replaces both default
 * timeouts, capped at `MAX_TIMER_MS`. Anything else (`30s`, `1e3`, `0`) keeps the default.
 */
export const resolveYtDlpTimeoutMs = (env: Readonly<Record<string, string | undefined>>, fallback: number): number => {
  const raw = env[YTDLP_TIMEOUT_ENV]?.trim() ?? "";
  if (!/^\d+$/.test(raw)) return fallback;
  const parsed = Number(raw);
  return parsed > 0 ? Math.min(parsed, MAX_TIMER_MS) : fallback;
};

/** Every argv ends in `--` and the URL, so an input that starts with `-` is never read as an option. */
export const withUrl = (args: readonly string[], url: string): readonly string[] => [...BASE_ARGS, ...args, "--", url];

/** Last non-empty stdout line: the path `--print after_move:filepath` prints. */
export const parseDownloadedPath = (stdout: string): string | undefined =>
  stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

const extractionError = (purpose: YtDlpPurpose, detail: string): PiTubeError => {
  if (purpose === "youtube_metadata") {
    return createError("YOUTUBE_EXTRACT_FAILED", `Failed to resolve YouTube media via yt-dlp (${detail}).`);
  }
  if (purpose === "instagram_metadata") {
    return createError("INSTAGRAM_EXTRACT_FAILED", `Failed to resolve Instagram media via yt-dlp (${detail}).`);
  }
  return createError("DOWNLOAD_FAILED", `Failed to download media via yt-dlp (${detail}).`);
};

/** Maps a finished yt-dlp run to `ok(stdout)` or the error for its purpose. */
export const interpretYtDlpRun = (
  result: ProcessResult,
  purpose: YtDlpPurpose,
  input: { readonly url: string; readonly timeoutMs: number; readonly isInstagram: boolean },
): Result<string> => {
  switch (result.outcome) {
    case "not_found":
      return err(
        createError("YTDLP_NOT_FOUND", "`yt-dlp` is required to process YouTube/Instagram URLs but was not found.", {
          hint: "Install yt-dlp (`brew install yt-dlp` or `pipx install yt-dlp`) and make sure it is on PATH, or run `pi-tube setup yt-dlp`.",
        }),
      );
    case "aborted":
      return err(createError("CANCELLED", "Operation cancelled."));
    case "output_too_large":
      return err(malformedOutput());
    case "timed_out":
      return err(extractionError(purpose, `yt-dlp timed out after ${Math.round(input.timeoutMs / 1000)}s`));
    case "exited": {
      if (result.exitCode === 0) return ok(result.stdout);
      const detail =
        [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join(" ").trim() || `exit code ${result.exitCode}`;
      if (input.isInstagram && isInstagramAuthRequiredFailure(detail)) {
        return err(
          createError("INSTAGRAM_AUTH_REQUIRED", `Instagram URL requires authentication for \`${input.url}\`.`),
        );
      }
      return err(extractionError(purpose, detail));
    }
  }
};

// Parsing below is ported unchanged from the pre-v3 intake (src/intake/tools/yt-dlp.ts).

interface ParsedFormatLike {
  url?: unknown;
  protocol?: unknown;
  ext?: unknown;
  vcodec?: unknown;
  acodec?: unknown;
  format_note?: unknown;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeTimestamp(value: unknown): string | undefined {
  if (typeof value !== "number" || value <= 0) {
    return undefined;
  }

  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString().slice(0, 10);
}

function normalizeUploadDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{8}$/.test(value)) {
    return undefined;
  }

  const year = Number.parseInt(value.slice(0, 4), 10);
  const month = Number.parseInt(value.slice(4, 6), 10);
  const day = Number.parseInt(value.slice(6, 8), 10);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return undefined;
  }

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function trimLinkCandidate(value: string): string {
  let link = value.replace(/[.,;:!?]+$/g, "");

  // Strip a trailing ")" only when it is unbalanced, so URLs that legitimately
  // end in a parenthesis (e.g. "..._(planet)") are preserved.
  while (link.endsWith(")") && (link.match(/\)/g) ?? []).length > (link.match(/\(/g) ?? []).length) {
    link = link.slice(0, -1).replace(/[.,;:!?]+$/g, "");
  }

  return link;
}

function extractDescriptionLinks(description: string | undefined): string[] | undefined {
  if (!description) {
    return undefined;
  }

  const matches = description.match(/https?:\/\/[^\s<>"']+/g) ?? [];
  const seen = new Set<string>();
  const links: string[] = [];

  for (const match of matches) {
    const link = trimLinkCandidate(match);
    if (!link || seen.has(link)) {
      continue;
    }

    seen.add(link);
    links.push(link);
  }

  return links.length > 0 ? links : undefined;
}

function isLikelyImage(format: ParsedFormatLike): boolean {
  const ext = isString(format.ext) ? format.ext.toLowerCase() : "";
  const note = isString(format.format_note) ? format.format_note.toLowerCase() : "";
  return (
    ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "webp" || ext === "gif" || note.includes("storyboard")
  );
}

function isSupportedProtocol(format: ParsedFormatLike): boolean {
  const protocol = isString(format.protocol) ? format.protocol.toLowerCase() : "";
  return protocol !== "mhtml";
}

function hasUsableMediaUrl(format: ParsedFormatLike): format is ParsedFormatLike & { url: string } {
  return isString(format.url) && isSupportedProtocol(format) && !isLikelyImage(format);
}

function isAudioOnly(format: ParsedFormatLike): boolean {
  const vcodec = isString(format.vcodec) ? format.vcodec.toLowerCase() : "";
  const acodec = isString(format.acodec) ? format.acodec.toLowerCase() : "";
  return vcodec === "none" && acodec !== "" && acodec !== "none";
}

function pickPreferredMediaUrl(parsed: Record<string, unknown>): string | undefined {
  if (isString(parsed.url)) {
    return parsed.url;
  }

  const requestedFormats = Array.isArray(parsed.requested_formats)
    ? (parsed.requested_formats as ParsedFormatLike[])
    : [];
  const requestedCandidates = requestedFormats.filter(hasUsableMediaUrl);
  const requestedAudio = requestedCandidates.find(isAudioOnly);
  if (requestedAudio?.url) {
    return requestedAudio.url;
  }
  if (requestedCandidates[0]?.url) {
    return requestedCandidates[0].url;
  }

  const formats = Array.isArray(parsed.formats) ? (parsed.formats as ParsedFormatLike[]) : [];
  const formatCandidates = formats.filter(hasUsableMediaUrl);
  const formatAudio = formatCandidates.find(isAudioOnly);
  if (formatAudio?.url) {
    return formatAudio.url;
  }
  if (formatCandidates[0]?.url) {
    return formatCandidates[0].url;
  }

  return undefined;
}

export function parseYtDlpOutput(stdout: string, withMetadata = false): Result<YtDlpResult> {
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    return err(malformedOutput());
  }

  const mediaUrl = pickPreferredMediaUrl(parsed);

  if (!mediaUrl) {
    return err(malformedOutput());
  }

  const title = typeof parsed.title === "string" ? parsed.title : undefined;

  if (!withMetadata) {
    return ok({ mediaUrl, title });
  }

  const description = isString(parsed.description) ? parsed.description : undefined;
  const publishedAt = normalizeTimestamp(parsed.timestamp) ?? normalizeUploadDate(parsed.upload_date);
  const descriptionLinks = extractDescriptionLinks(description);

  return ok({ mediaUrl, title, publishedAt, description, descriptionLinks });
}

export function isInstagramAuthRequiredFailure(detail: string): boolean {
  return /(login required|requires login|you need to log in|challenge_required|checkpoint_required|private content|not available due to login)/i.test(
    detail,
  );
}
